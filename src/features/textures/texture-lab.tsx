"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Mesh, type BufferGeometry } from "three";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { holdGeometry } from "@/features/holds/stl-scene";
import { MAX_STL_PREVIEW_BYTES } from "@/features/holds/stl-limits";
import { Viewer, isDarkTheme } from "@/features/model-viewer/viewer";
import { VIEWER_CONTROLS } from "@/features/model-viewer/gestures";
import { displaceSurface, refineSurface } from "./displacement";
import { exampleHold } from "./example-hold";
import { makeHeightMap, PATTERNS, type TexturePattern } from "./height-map";
import { loadHoldLink } from "./hold-source";
import styles from "./texture-lab.module.css";

const DEFAULT_DENSITY: Record<TexturePattern, number> = {
  "sweeping-strata": 2,
  strata: 5,
  flecks: 6,
  shoals: 4,
  sandstone: 6,
  dimples: 8,
};

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function TextureLab() {
  const [pattern, setPattern] = useState<TexturePattern>("sweeping-strata");
  const [seed, setSeed] = useState(73);
  const [density, setDensity] = useState(2);
  const [tileMm, setTileMm] = useState(60);
  const [depthMm, setDepthMm] = useState(0.65);
  const [reverse, setReverse] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [source, setSource] = useState<{
    label: string;
    geometry: BufferGeometry;
  }>();
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const [viewerError, setViewerError] = useState(false);
  const request = useRef<AbortController | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<Viewer | null>(null);

  const tile = useMemo(
    () => makeHeightMap({ pattern, seed, density }),
    [pattern, seed, density],
  );
  const surface = useMemo(() => {
    if (source) return refineSurface(source.geometry);
    const sample = exampleHold();
    try {
      return refineSurface(sample);
    } finally {
      sample.dispose();
    }
  }, [source]);
  const mesh = useMemo(
    () =>
      displaceSurface(surface, tile, {
        tileMm,
        depthMm,
        direction: (pattern === "dimples") !== reverse ? -1 : 1,
        baseline: pattern === "dimples" ? 1 : 0,
      }),
    [surface, tile, tileMm, depthMm, pattern, reverse],
  );

  useEffect(() => () => source?.geometry.dispose(), [source]);
  useEffect(() => () => surface.dispose(), [surface]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (!preview.current) return;
    let active = true;
    try {
      viewer.current = new Viewer(preview.current, {
        dark: isDarkTheme(),
        color: 0x8eabb9,
        reliefLighting: true,
      });
    } catch {
      queueMicrotask(() => {
        if (active) setViewerError(true);
      });
    }
    return () => {
      active = false;
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, []);

  const displayed = showOriginal ? surface : mesh;
  const lastSurface = useRef<BufferGeometry | null>(null);
  useEffect(() => {
    if (!viewer.current) return;
    const geometry = displayed.clone();
    if (showOriginal) geometry.computeVertexNormals();
    viewer.current.setGeometry(geometry, lastSurface.current !== surface);
    lastSurface.current = surface;
  }, [displayed, showOriginal, surface]);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const frame = ctx.createImageData(tile.size, tile.size);
    for (let i = 0; i < tile.pixels.length; i++) {
      frame.data.fill(tile.pixels[i], 4 * i, 4 * i + 3);
      frame.data[4 * i + 3] = 255;
    }
    ctx.putImageData(frame, 0, 0);
  }, [tile]);

  async function load(
    getModel: (signal: AbortSignal) => Promise<NonNullable<typeof source>>,
  ) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const model = await getModel(controller.signal);
      if (controller.signal.aborted) model.geometry.dispose();
      else {
        setSource(model);
        setShowOriginal(false);
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "Could not open the hold.",
        );
    } finally {
      if (request.current === controller) setLoading(false);
    }
  }

  function openLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load((signal) => loadHoldLink(link, signal));
  }

  function openFile(file: File) {
    void load(async () => {
      if (file.size > MAX_STL_PREVIEW_BYTES)
        throw new Error("Choose an STL under 25 MB.");
      return {
        label: file.name,
        geometry: holdGeometry(await file.arrayBuffer()),
      };
    });
  }

  function savePng() {
    setExportError("");
    canvas.current?.toBlob((blob) => {
      if (blob) download(blob, `${pattern}-${seed}-${density}.png`);
      else setExportError("Could not export this PNG.");
    }, "image/png");
  }

  function saveStl() {
    setExportError("");
    const object = new Mesh(mesh, []);
    const data = new STLExporter().parse(object, { binary: true });
    download(
      new Blob([data.buffer as ArrayBuffer], { type: "model/stl" }),
      `${pattern}-approximation.stl`,
    );
  }

  return (
    <div className={`lab ${styles.layout}`}>
      <aside className={`lab-controls ${styles.controls}`}>
        <section className={styles.section} aria-labelledby="texture-source">
          <h2 id="texture-source">Hold</h2>
          <form onSubmit={openLink} className={styles.section}>
            <label className="lab-field">
              Garage Holds link
              <input
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="/make/sloper?preset=…"
                required
              />
            </label>
            <button className="button button-outline" disabled={loading}>
              {loading ? "Loading hold…" : "Load hold"}
            </button>
          </form>
          <label className="lab-field">
            Or open an STL
            <input
              type="file"
              accept=".stl"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) openFile(file);
                event.target.value = "";
              }}
            />
          </label>
          {source && (
            <button
              type="button"
              className="button button-outline"
              onClick={() => {
                request.current?.abort();
                setLoading(false);
                setError("");
                setSource(undefined);
              }}
            >
              Use sample hold
            </button>
          )}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <p aria-live="polite" className={styles.note}>
            {source?.label ?? "Sample hold"}
          </p>
        </section>
        <section className={styles.section} aria-labelledby="texture-pattern">
          <h2 id="texture-pattern">Texture</h2>
          <label className="lab-field">
            Pattern
            <select
              value={pattern}
              onChange={(event) => {
                const selected = event.target.value as TexturePattern;
                setPattern(selected);
                setDensity(DEFAULT_DENSITY[selected]);
                setReverse(false);
              }}
            >
              {Object.entries(PATTERNS).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="lab-field">
            {pattern === "sweeping-strata"
              ? "Strokes"
              : pattern === "sandstone"
                ? "Bands"
                : "Clusters"}{" "}
            · {density}
            <input
              type="range"
              min="1"
              max="12"
              value={density}
              onChange={(event) => setDensity(event.target.valueAsNumber)}
            />
          </label>
          <button
            type="button"
            className="button button-outline"
            onClick={() => setSeed((n) => n + 1)}
          >
            Generate variation
          </button>
          <label className="lab-field">
            Tile size · {tileMm} mm
            <input
              type="range"
              min="12"
              max="140"
              value={tileMm}
              onChange={(event) => setTileMm(event.target.valueAsNumber)}
            />
          </label>
          <label className="lab-field">
            Depth · {depthMm.toFixed(2)} mm
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={depthMm}
              onChange={(event) => setDepthMm(event.target.valueAsNumber)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={reverse}
              onChange={(event) => setReverse(event.target.checked)}
            />{" "}
            Reverse relief
          </label>
        </section>
      </aside>
      <section className="lab-stage" aria-labelledby="texture-preview">
        <div className="lab-stage-preview">
          <div className={styles.actions}>
            <h2 id="texture-preview">Hold preview</h2>
            <label>
              <input
                type="checkbox"
                checked={showOriginal}
                onChange={(event) => setShowOriginal(event.target.checked)}
              />{" "}
              Show original
            </label>
          </div>
          <div
            className="lab-viewer"
            ref={preview}
            tabIndex={0}
            aria-label="Interactive hold preview"
            title={VIEWER_CONTROLS}
          >
            {viewerError && (
              <p className="lab-viewer-note">
                WebGL is unavailable. You can still generate and download
                textures.
              </p>
            )}
          </div>
        </div>
        <div className={styles.details}>
          <canvas
            className={styles.map}
            ref={canvas}
            width={tile.size}
            height={tile.size}
            role="img"
            aria-label={`${PATTERNS[pattern]} height map`}
          />
          <div className={styles.section}>
            <h2>Export</h2>
            <div className={styles.actions}>
              <button
                type="button"
                className="button button-dark"
                onClick={savePng}
              >
                Download PNG for Orca
              </button>
              <button
                type="button"
                className="button button-outline"
                onClick={saveStl}
              >
                Download approximate STL
              </button>
            </div>
            <p className={styles.note}>
              PNG contains the height map. Set tile size, depth and direction in
              Orca.
            </p>
            <p className={styles.note}>
              The STL projects relief from above and fades near the back. Check
              mounting holes, seats and thin walls before printing.
            </p>
            {exportError && <p role="alert">{exportError}</p>}
            <Link href="/orca-textures">How to import in OrcaSlicer</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
