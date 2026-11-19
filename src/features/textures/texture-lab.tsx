"use client";

import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
} from "react";
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
import { createPaintMask, paintSegment, type PaintMask } from "./paint-mask";
import { ROCK_PATTERNS } from "./rock-patterns";
import {
  loadSavedPresets,
  PRESET_LAB_NAMES,
  PRESET_LABS,
} from "@/features/lab-presets/saved-presets";
import { canImportPreset, type HoldSourceOption } from "./source-options";
import { texturedStlFilename, texturePngFilename } from "./export-name";
import styles from "./texture-lab.module.css";

const DEFAULT_DENSITY: Partial<Record<TexturePattern, number>> = {
  "sweeping-strata": 2,
  strata: 5,
  flecks: 6,
  shoals: 4,
  sandstone: 6,
  dimples: 8,
  "granite-grain": 8,
  "granite-crystals": 3,
  "basalt-vesicles": 6,
};

const MESH_DETAIL = {
  coarse: { edge: 3.2, budget: 35_000 },
  standard: { edge: 1.6, budget: 120_000 },
  fine: { edge: 0.75, budget: 500_000 },
} as const;

type PaintMode = "orbit" | "paint" | "erase";
type Point = { x: number; y: number };
type Stroke = {
  id: number;
  previous: Point | null;
  mask: PaintMask;
  lastUpdate: number;
};

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  change,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  change: (value: number) => void;
}) {
  return (
    <label className="lab-field">
      {label} · {value}
      {suffix}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => change(event.target.valueAsNumber)}
      />
    </label>
  );
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function TextureLab({
  savedOptions,
  initialSource,
  initialError,
  savedUnavailable,
}: {
  savedOptions: HoldSourceOption[];
  initialSource?: { link: string; label?: string };
  initialError: string;
  savedUnavailable: boolean;
}) {
  const [pattern, setPattern] = useState<TexturePattern>("font-sandstone");
  const [seed, setSeed] = useState(73);
  const [density, setDensity] = useState(4);
  const [tileMm, setTileMm] = useState(60);
  const [depthMm, setDepthMm] = useState(1);
  const [midlevel, setMidlevel] = useState(0.5);
  const [contrast, setContrast] = useState(1.25);
  const [detail, setDetail] = useState(0.5);
  const [rotation, setRotation] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [meshDetail, setMeshDetail] =
    useState<keyof typeof MESH_DETAIL>("fine");
  const [mode, setMode] = useState<PaintMode>("orbit");
  const [diameter, setDiameter] = useState(22);
  const [softness, setSoftness] = useState(0.6);
  const [opacity, setOpacity] = useState(1);
  const [mask, setMask] = useState<PaintMask | null>(null);
  const [undo, setUndo] = useState<PaintMask | null>();
  const stroke = useRef<Stroke | null>(null);
  const [reverse, setReverse] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [source, setSource] = useState<{
    label: string;
    geometry: BufferGeometry;
  }>();
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [browserOptions, setBrowserOptions] = useState<HoldSourceOption[]>([]);
  const [exportError, setExportError] = useState("");
  const [viewerError, setViewerError] = useState(false);
  const request = useRef<AbortController | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const sourceOptions = [...savedOptions, ...browserOptions];

  const tile = useMemo(
    () => makeHeightMap({ pattern, seed, density, contrast, detail }),
    [pattern, seed, density, contrast, detail],
  );
  const surface = useMemo(() => {
    const { edge, budget } = MESH_DETAIL[meshDetail];
    if (source) return refineSurface(source.geometry, edge, budget);
    const sample = exampleHold();
    try {
      return refineSurface(sample, edge, budget);
    } finally {
      sample.dispose();
    }
  }, [source, meshDetail]);
  const mesh = useMemo(
    () =>
      displaceSurface(surface, tile, {
        tileMm,
        depthMm,
        direction: reverse ? -1 : 1,
        baseline: midlevel,
        rotation,
        offsetX,
        offsetY,
        mask,
      }),
    [
      surface,
      tile,
      tileMm,
      depthMm,
      reverse,
      midlevel,
      rotation,
      offsetX,
      offsetY,
      mask,
    ],
  );

  useEffect(() => () => source?.geometry.dispose(), [source]);
  useEffect(() => () => surface.dispose(), [surface]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    let active = true;
    function refresh() {
      if (!active) return;
      setBrowserOptions(
        PRESET_LABS.filter(canImportPreset).flatMap((lab) =>
          loadSavedPresets(lab).map((preset) => ({
            id: `local:${lab}:${preset.id}`,
            lab,
            label: preset.name,
            link: `/make/${lab}${preset.search}`,
            group: "This browser",
          })),
        ),
      );
    }
    queueMicrotask(refresh);
    window.addEventListener("storage", refresh);
    return () => {
      active = false;
      window.removeEventListener("storage", refresh);
    };
  }, []);

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
        resetPaint();
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

  function importLink(link: string, label?: string) {
    void load(async (signal) => {
      const model = await loadHoldLink(link, signal);
      return label ? { ...model, label } : model;
    });
  }

  const importInitialSource = useEffectEvent(() => {
    if (initialSource) importLink(initialSource.link, initialSource.label);
  });
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) importInitialSource();
    });
    return () => {
      active = false;
    };
  }, []);

  function openLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    importLink(link);
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
      if (blob)
        download(
          blob,
          texturePngFilename({
            pattern,
            seed,
            density,
            contrast,
            detail: Object.hasOwn(ROCK_PATTERNS, pattern) ? detail : undefined,
          }),
        );
      else setExportError("Could not export this PNG.");
    }, "image/png");
  }

  function resetPaint() {
    stroke.current = null;
    setMode("orbit");
    setMask(null);
    setUndo(undefined);
  }

  function blankMask(full: boolean) {
    const box = surface.boundingBox!;
    return createPaintMask(box.min, box.max, full);
  }

  function changeMode(next: PaintMode) {
    if (next !== "orbit") setShowOriginal(false);
    setMode(next);
  }

  function applyBrush(active: Stroke, event: PointerEvent<HTMLDivElement>) {
    const hit = viewer.current?.pickHold(event.clientX, event.clientY);
    if (!hit) {
      active.previous = null;
      return;
    }
    paintSegment(active.mask, active.previous ?? hit, hit, {
      radius: diameter / 2,
      softness,
      opacity,
      erase: mode === "erase",
    });
    active.previous = hit;
  }

  function beginStroke(event: PointerEvent<HTMLDivElement>) {
    if (stroke.current || event.button !== 0) return;
    const hit = viewer.current?.pickHold(event.clientX, event.clientY);
    if (!hit) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = mask
      ? { ...mask, pixels: mask.pixels.slice() }
      : blankMask(mode === "erase");
    const active = {
      id: event.pointerId,
      previous: hit,
      mask: next,
      lastUpdate: performance.now(),
    };
    stroke.current = active;
    setShowOriginal(false);
    setUndo(mask);
    paintSegment(next, hit, hit, {
      radius: diameter / 2,
      softness,
      opacity,
      erase: mode === "erase",
    });
    setMask({ ...next, pixels: next.pixels.slice() });
  }

  function moveStroke(event: PointerEvent<HTMLDivElement>) {
    const active = stroke.current;
    if (
      !active ||
      active.id !== event.pointerId ||
      performance.now() - active.lastUpdate < 90
    )
      return;
    active.lastUpdate = performance.now();
    applyBrush(active, event);
    setMask({ ...active.mask, pixels: active.mask.pixels.slice() });
  }

  function endStroke(event: PointerEvent<HTMLDivElement>) {
    const active = stroke.current;
    if (!active || active.id !== event.pointerId) return;
    if (event.type === "pointerup") applyBrush(active, event);
    stroke.current = null;
    setMask(active.mask);
  }

  function saveStl() {
    setExportError("");
    const object = new Mesh(mesh, []);
    const data = new STLExporter().parse(object, { binary: true });
    download(
      new Blob([data.buffer as ArrayBuffer], { type: "model/stl" }),
      texturedStlFilename({
        hold: source?.label ?? "Sample hold",
        pattern,
        tileMm,
        depthMm,
        reverse,
        painted: Boolean(mask),
        seed,
      }),
    );
  }

  return (
    <div className={`lab ${styles.layout}`}>
      <aside className={`lab-controls ${styles.controls}`}>
        <section className={styles.section} aria-labelledby="texture-source">
          <h2 id="texture-source">Hold</h2>
          {sourceOptions.length > 0 && (
            <label className="lab-field">
              Import from Saved
              <select
                aria-label="Import from Saved"
                value=""
                disabled={loading}
                onChange={(event) => {
                  const picked = sourceOptions.find(
                    (option) => option.id === event.target.value,
                  );
                  if (picked) importLink(picked.link, picked.label);
                }}
              >
                <option value="" disabled>
                  Choose a hold or preset
                </option>
                {(["Lab presets", "Saved holds", "This browser"] as const).map(
                  (group) => {
                    const options = sourceOptions.filter(
                      (option) => option.group === group,
                    );
                    return options.length ? (
                      <optgroup key={group} label={group}>
                        {options.map(({ id, label, lab }) => (
                          <option key={id} value={id}>
                            {lab
                              ? `${label} · ${PRESET_LAB_NAMES[lab]}`
                              : label}
                          </option>
                        ))}
                      </optgroup>
                    ) : null;
                  },
                )}
              </select>
            </label>
          )}
          <p className={styles.note}>
            {savedUnavailable && <>Some saved items could not be loaded. </>}
            <Link href="/saved">Browse Saved holds and presets</Link>
          </p>
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
                resetPaint();
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
              aria-label="Pattern"
              value={pattern}
              onChange={(event) => {
                const selected = event.target.value as TexturePattern;
                setPattern(selected);
                setDensity(DEFAULT_DENSITY[selected] ?? 4);
                setMidlevel(
                  selected === "dimples"
                    ? 1
                    : Object.hasOwn(ROCK_PATTERNS, selected)
                      ? 0.5
                      : 0,
                );
                setReverse(false);
              }}
            >
              <optgroup label="Rock textures">
                {Object.entries(ROCK_PATTERNS).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Other patterns">
                {Object.entries(PATTERNS)
                  .filter(([key]) => !Object.hasOwn(ROCK_PATTERNS, key))
                  .map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>
          <label className="lab-field">
            {pattern === "sweeping-strata"
              ? "Strokes"
              : pattern === "sandstone"
                ? "Bands"
                : "Density"}{" "}
            · {density}
            <input
              type="range"
              min="1"
              max="18"
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
              min="5"
              max="240"
              value={tileMm}
              onChange={(event) => setTileMm(event.target.valueAsNumber)}
            />
          </label>
          <label className="lab-field">
            Depth · {depthMm.toFixed(2)} mm
            <input
              type="range"
              min="0"
              max="6"
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
          <details>
            <summary>Texture adjustments</summary>
            <div className={styles.section}>
              <Range
                label="Contrast"
                value={contrast}
                min={0.25}
                max={3}
                step={0.05}
                change={setContrast}
              />
              {Object.hasOwn(ROCK_PATTERNS, pattern) && (
                <Range
                  label="Fine grain"
                  value={detail}
                  min={0}
                  max={1}
                  step={0.05}
                  change={setDetail}
                />
              )}
              <Range
                label="Midlevel"
                value={midlevel}
                min={0}
                max={1}
                step={0.05}
                change={setMidlevel}
              />
              <p className={styles.note}>
                Midlevel is the gray that stays at the original surface. Lower
                tones cut in and higher tones rise.
              </p>
              <Range
                label="Rotation"
                value={rotation}
                min={-180}
                max={180}
                suffix="°"
                change={setRotation}
              />
              <Range
                label="Horizontal shift"
                value={offsetX}
                min={-120}
                max={120}
                suffix=" mm"
                change={setOffsetX}
              />
              <Range
                label="Vertical shift"
                value={offsetY}
                min={-120}
                max={120}
                suffix=" mm"
                change={setOffsetY}
              />
              <label className="lab-field">
                Mesh detail
                <select
                  value={meshDetail}
                  onChange={(event) =>
                    setMeshDetail(
                      event.target.value as keyof typeof MESH_DETAIL,
                    )
                  }
                >
                  <option value="coarse">Coarse</option>
                  <option value="standard">Standard</option>
                  <option value="fine">Fine</option>
                </select>
              </label>
              <p className={styles.note}>
                Higher mesh detail can reveal finer grain. The triangle budget
                still limits dense holds.
              </p>
            </div>
          </details>
        </section>
        <section className={styles.section} aria-labelledby="texture-brush">
          <h2 id="texture-brush">Brush</h2>
          <p className={styles.note}>
            Choose Paint or Erase above the preview, then drag on the hold. The
            first Paint stroke starts from a bare hold. Erase starts from full
            coverage.
          </p>
          <Range
            label="Brush diameter"
            value={diameter}
            min={2}
            max={80}
            suffix=" mm"
            change={setDiameter}
          />
          <Range
            label="Edge fade"
            value={Math.round(softness * 100)}
            min={0}
            max={100}
            suffix="%"
            change={(value) => setSoftness(value / 100)}
          />
          <div className={styles.actions}>
            <Range
              label="Brush strength"
              value={Math.round(opacity * 100)}
              min={5}
              max={100}
              step={5}
              suffix="%"
              change={(value) => setOpacity(value / 100)}
            />
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className="button button-outline"
              disabled={undo === undefined}
              onClick={() => {
                if (undo !== undefined) setMask(undo);
                setUndo(undefined);
              }}
            >
              Undo
            </button>
            <button
              type="button"
              className="button button-outline"
              onClick={() => {
                setUndo(mask);
                setMask(blankMask(false));
                changeMode("paint");
              }}
            >
              Clear coverage
            </button>
            <button
              type="button"
              className="button button-outline"
              disabled={!mask}
              onClick={() => {
                setUndo(mask);
                setMask(null);
                changeMode("orbit");
              }}
            >
              Cover whole hold
            </button>
          </div>
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
            <label>
              Tool{" "}
              <select
                aria-label="Preview tool"
                value={mode}
                disabled={viewerError}
                onChange={(event) =>
                  changeMode(event.target.value as PaintMode)
                }
              >
                <option value="orbit">Orbit</option>
                <option value="paint">Paint</option>
                <option value="erase">Erase</option>
              </select>
            </label>
            <button
              type="button"
              className="button button-outline"
              disabled={viewerError}
              onClick={() => viewer.current?.setView("top")}
            >
              Top view
            </button>
          </div>
          <div className={styles.workbench}>
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
            {mode !== "orbit" && !viewerError && (
              <div
                className={styles.paintTarget}
                onPointerDown={beginStroke}
                onPointerMove={moveStroke}
                onPointerUp={endStroke}
                onPointerCancel={endStroke}
                onLostPointerCapture={endStroke}
              />
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
              PNG contains the repeating pattern. Paint the area and set tile
              size, depth and midlevel in Orca.
            </p>
            <p className={styles.note}>
              The STL includes painted coverage and projects relief vertically
              from above. Check mounting holes, seats and thin walls before
              printing, especially at higher depth.
            </p>
            {exportError && <p role="alert">{exportError}</p>}
            <Link href="/orca-textures">How to import in OrcaSlicer</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
