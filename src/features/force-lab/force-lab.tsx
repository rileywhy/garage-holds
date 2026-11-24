"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Crosshair, X } from "lucide-react";
import type { Control, Kind, Parameters } from "@/features/hold-lab/api";
import { presentControls } from "@/features/hold-lab/control-presentation";
import { ControlRow } from "@/features/hold-lab/control-row";
import { mountingControlVisible } from "@/features/hold-lab/mounting";
import { freshPreviewUrl } from "@/features/holds/preview-actions";
import { isDarkTheme } from "@/features/model-viewer/viewer";
import { NO_3D_HELP, VIEWER_CONTROLS } from "@/features/model-viewer/gestures";
import {
  analyze,
  fetchSchema,
  type Analysis,
  type ForceSchema,
  type Load,
  type Source,
} from "./api";
import {
  TENSION_CSS,
  css,
  diverging,
  gradient,
  ramp,
  stressScale,
} from "./colours";
import type { PileHold } from "./pile";
import {
  ForceScene,
  holdGeometry,
  type Cut,
  type Mode,
  type View,
} from "./scene";
import styles from "./force-lab.module.css";

// An unlisted page: any Hold Lab hold, or one from the pile, on a wall, a
// pull you set, and where the force goes. The model and every figure live
// in tools/jug-force-lab.

const G = 9.81;
const TABS = ["Pull", "Wall", "Hold", "Shape"] as const;
type Tab = (typeof TABS)[number];
const MODES: [Mode, string][] = [
  ["stress", "Layer stress"],
  ["use", "Strength used"],
  ["pressure", "Wall pressure"],
];
const VIEWS: [View, string][] = [
  ["three", "3D"],
  ["side", "Side"],
  ["front", "Front"],
  ["back", "Behind"],
];
const CUTS: [CutAxis, string][] = [
  ["none", "No cut"],
  ["x", "Cut across"],
  ["z", "Cut a layer"],
];
type CutAxis = "none" | "x" | "z";
// Mounting switches every lab shares, named as the labs name them.
const SWITCHES: Record<string, string> = {
  bolt_mount: "Bolt + one screw",
  auto_seat: "Automatic screw seat",
  auto_spacing: "Automatic screw spacing",
  auto_screw_count: "Choose the screw count from the size",
};
// A signed model link lasts an hour; fetch a new one well before then.
const LINK_LIFETIME_MS = 45 * 60 * 1000;

const fmt = (v: number, digits = 0) =>
  v.toLocaleString("en", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
const kg = (n: number) => fmt(n / G);
const pct = (u: number) => (u >= 10 ? ">999%" : `${fmt(u * 100)}%`);

interface RowSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  help: string;
  shown?: (v: number) => string;
}

const PULL_ROWS: RowSpec[] = [
  {
    key: "force",
    label: "Force",
    min: 0,
    max: 3000,
    step: 10,
    unit: "N",
    help: "A hard dynamic catch on a jug is around 1,000 to 1,500 N.",
    shown: (v) => `${kg(v)} kg`,
  },
  {
    key: "pull_angle",
    label: "Outward pull angle",
    min: -30,
    max: 60,
    step: 1,
    unit: "°",
    help: "0 is straight down. More leans the pull out, like a body swinging away below.",
  },
  {
    key: "side_angle",
    label: "Side pull angle",
    min: -60,
    max: 60,
    step: 1,
    unit: "°",
    help: "Swings the pull along the hold, as in a gaston or a cross-through.",
  },
  {
    key: "position",
    label: "Hand position across the hold",
    min: -80,
    max: 80,
    step: 1,
    unit: "mm",
    help: "Where along the hold the hand sits. 0 is the middle.",
  },
  {
    key: "height",
    label: "Grip height off the wall",
    min: 2,
    max: 98,
    step: 1,
    unit: "%",
    help: "Where the fingers land, as a share of the hold's height off the wall: low is deep in by the wall, high is out on the top.",
  },
  {
    key: "width",
    label: "Hand width",
    min: 10,
    max: 120,
    step: 1,
    unit: "mm",
    help: "How far across the fingers spread: about 60 mm for four fingers, 20 to 35 for one or two in a pocket.",
  },
];
const WALL_ANGLE: RowSpec = {
  key: "wall_angle",
  label: "Wall angle",
  min: -15,
  max: 90,
  step: 1,
  unit: "°",
  help: "Past vertical: 0 is a vertical wall, 40 a typical board, 90 a roof.",
  shown: (v) => (v === 0 ? "vertical" : v > 0 ? "overhang" : "slab"),
};

type Bounds = { min: [number, number, number]; max: [number, number, number] };

export function ForceLab({ pile }: { pile: PileHold[] }) {
  const box = useRef<HTMLDivElement>(null);
  const scene = useRef<ForceScene | null>(null);
  const meshKey = useRef("");
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const [schema, setSchema] = useState<ForceSchema | null>(null);
  const [tab, setTab] = useState<Tab>("Pull");
  const [choice, setChoice] = useState("kind:jug");
  const [settings, setSettings] = useState<Record<string, Parameters>>({});
  const [presets, setPresets] = useState<Record<string, string>>({});
  const [turn, setTurn] = useState(0);
  const [link, setLink] = useState<{
    fileId: string;
    url: string;
    at: number;
  } | null>(null);
  const [load, setLoad] = useState<Load | null>(null);
  const [wall, setWall] = useState("plywood_18");
  const [hold, setHold] = useState("pla");
  const [screwLength, setScrewLength] = useState(50);
  const [screw, setScrew] = useState("no10");
  const [mode, setMode] = useState<Mode>("stress");
  const [xray, setXray] = useState(false);
  const [view, setView] = useState<View>("three");
  const [cutAxis, setCutAxis] = useState<CutAxis>("none");
  const [cutAt, setCutAt] = useState(0);
  const [picking, setPicking] = useState(false);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [result, setResult] = useState<
    (Analysis & { sourceKey: string }) | null
  >(null);
  const [backImage, setBackImage] = useState<string>();
  const [status, setStatus] = useState({
    text: "Loading the model…",
    error: false,
  });
  const [viewerFailed, setViewerFailed] = useState(false);

  const kind = choice.startsWith("kind:") ? (choice.slice(5) as Kind) : null;
  const pileHold = choice.startsWith("pile:")
    ? (pile.find((p) => p.id === choice.slice(5)) ?? null)
    : null;
  const kindSchema = kind && schema ? schema.kinds[kind] : null;
  const kindSettings =
    kind && kindSchema ? (settings[kind] ?? kindSchema.defaults) : null;

  // The schema, then the first analysis.
  useEffect(() => {
    const controller = new AbortController();
    fetchSchema(controller.signal)
      .then((s) => {
        setSchema(s);
        setLoad(s.load.defaults);
        setScrewLength(s.screw_length);
        setScrew(s.screw);
        setChoice(`kind:${s.default_kind}`);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError")
          setStatus({ text: error.message, error: true });
      });
    return () => controller.abort();
  }, []);

  // The 3D view, following the site's theme.
  useEffect(() => {
    if (!box.current) return;
    let viewer: ForceScene;
    try {
      viewer = new ForceScene(box.current, isDarkTheme());
    } catch {
      // No WebGL: the numbers below still work without a picture.
      queueMicrotask(() => setViewerFailed(true));
      return;
    }
    scene.current = viewer;
    const retheme = () => viewer.setTheme(isDarkTheme());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", retheme);
    const observer = new MutationObserver(retheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      media.removeEventListener("change", retheme);
      observer.disconnect();
      viewer.dispose();
      scene.current = null;
    };
  }, []);

  // A pile hold needs a signed link to its model, fetched when picked and
  // again before it expires.
  useEffect(() => {
    if (!pileHold) return;
    if (
      link?.fileId === pileHold.fileId &&
      Date.now() - link.at < LINK_LIFETIME_MS
    )
      return;
    let live = true;
    queueMicrotask(() =>
      setStatus({ text: "Fetching the hold from the pile…", error: false }),
    );
    freshPreviewUrl(pileHold.fileId)
      .then((url) => {
        if (!live) return;
        if (url) setLink({ fileId: pileHold.fileId, url, at: Date.now() });
        else
          setStatus({
            text: "This hold's model could not be loaded.",
            error: true,
          });
      })
      .catch(() => {
        if (live)
          setStatus({
            text: "This hold's model could not be loaded.",
            error: true,
          });
      });
    return () => {
      live = false;
    };
  }, [pileHold, link]);

  // What to load, and the key that says when its mesh changes.
  const request = useMemo((): { source: Source; key: string } | null => {
    if (kind && kindSettings)
      return {
        source: { kind, settings: kindSettings, turn },
        key: JSON.stringify([kind, kindSettings, turn]),
      };
    if (pileHold && link?.fileId === pileHold.fileId)
      return {
        source: {
          pile: {
            url: link.url,
            orientation: pileHold.orientation,
            title: pileHold.title,
          },
          turn,
        },
        key: JSON.stringify([pileHold.fileId, turn]),
      };
    return null;
  }, [kind, kindSettings, pileHold, link, turn]);

  const wantGrid = cutAxis !== "none";

  // Re-solve shortly after anything changes; a newer request cancels an
  // older one. The mesh is fetched only when the hold's shape changed.
  useEffect(() => {
    if (!schema || !load || !request) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const needMesh = meshKey.current !== request.key;
      setStatus({
        text: needMesh && pileHold ? "Analysing the pile hold…" : "Solving…",
        error: false,
      });
      try {
        const next = await analyze(
          {
            source: request.source,
            load,
            wall,
            hold,
            screw,
            screw_length: screwLength,
            mesh: needMesh,
            grid: wantGrid,
          },
          controller.signal,
        );
        let geometry;
        if (next.mesh.vertices && next.mesh.faces) {
          geometry = holdGeometry(next.mesh.vertices, next.mesh.faces);
          meshKey.current = request.key;
          geometry.computeBoundingBox();
          const b = geometry.boundingBox!;
          setBounds({
            min: [b.min.x, b.min.y, b.min.z],
            max: [b.max.x, b.max.y, b.max.z],
          });
        }
        scene.current?.show(next, geometry);
        setBackImage(scene.current?.pressureImage());
        setResult({ ...next, sourceKey: request.key });
        const count = next.fasteners.length;
        setStatus({
          text: `${next.source.label} · ${count} ${count === 1 ? "fastener" : "fasteners"} · ${next.wall.label} · ${next.hold.label}`,
          error: false,
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setStatus({ text: (error as Error).message, error: true });
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    schema,
    load,
    wall,
    hold,
    screw,
    screwLength,
    request,
    wantGrid,
    pileHold,
  ]);

  useEffect(() => scene.current?.setMode(mode, xray), [mode, xray]);

  const cut: Cut = useMemo(
    () => (cutAxis === "none" ? null : { axis: cutAxis, value: cutAt }),
    [cutAxis, cutAt],
  );
  useEffect(() => scene.current?.setCut(cut), [cut, result]);

  const halfWidth = bounds
    ? Math.max(5, Math.floor(Math.max(-bounds.min[0], bounds.max[0])))
    : 80;

  function changeLoad(key: string, value: number) {
    setLoad((current) =>
      current
        ? {
            ...current,
            [key]: key === "height" ? value / 100 : value,
            // Moving the hand by slider replaces a picked spot.
            point:
              key === "position" || key === "height" ? null : current.point,
          }
        : current,
    );
  }

  function choose(value: string) {
    setChoice(value);
    meshKey.current = "";
    scene.current?.refit();
    setLoad((current) => (current ? { ...current, point: null } : current));
  }

  function applyPreset(name: string) {
    if (!kind || !kindSchema) return;
    setPresets((p) => ({ ...p, [kind]: name }));
    setSettings((s) => ({
      ...s,
      [kind]: { ...(name ? kindSchema.presets[name] : kindSchema.defaults) },
    }));
    scene.current?.refit();
  }

  function changeSetting(key: string, value: number | boolean | string) {
    if (!kind || !kindSettings) return;
    if (key === "size")
      setLoad((current) =>
        current?.point ? { ...current, point: null } : current,
      );
    setSettings((s) => ({ ...s, [kind]: { ...kindSettings, [key]: value } }));
    setPresets((p) => ({ ...p, [kind]: "" }));
  }

  function chooseCut(axis: CutAxis) {
    setCutAxis(axis);
    if (bounds && axis !== "none") {
      const i = axis === "x" ? 0 : 2;
      setCutAt(Math.round((bounds.min[i] + bounds.max[i]) / 2));
    }
  }

  // A click (not a drag) on the hold places the hand there.
  function onPointerDown(event: React.PointerEvent) {
    pointer.current = { x: event.clientX, y: event.clientY };
  }
  function onPointerUp(event: React.PointerEvent) {
    const start = pointer.current;
    pointer.current = null;
    if (!picking || !start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5)
      return;
    const spot = scene.current?.pick(event.clientX, event.clientY);
    if (!spot) return;
    setLoad((current) => (current ? { ...current, point: spot } : current));
    setPicking(false);
  }

  const loadValue = (key: string) =>
    load
      ? key === "height"
        ? Math.round(load.height * 100)
        : (load[key as keyof Load] as number)
      : 0;
  const loadInitial = (key: string) =>
    schema
      ? key === "height"
        ? schema.load.defaults.height * 100
        : (schema.load.defaults[key as keyof Load] as number)
      : 0;

  const cutAxisIndex = cutAxis === "x" ? 0 : 2;

  const shapeControls =
    kind && kindSchema && kindSettings
      ? presentControls(kind, kindSchema.controls).filter(
          (control) =>
            (!control.shapes ||
              control.shapes.includes(String(kindSettings.shape))) &&
            !(control.hidden_by && kindSettings[control.hidden_by]) &&
            mountingControlVisible(control.key, kindSettings),
        )
      : [];
  function shapeRow(control: Control) {
    if (!kindSchema || !kindSettings) return null;
    return (
      <ControlRow
        key={control.key}
        control={control}
        value={Number(kindSettings[control.key])}
        disabled={false}
        clamp
        onChange={changeSetting}
        onReset={() =>
          changeSetting(control.key, kindSchema.defaults[control.key])
        }
      />
    );
  }

  const pileSource =
    pileHold && result?.sourceKey === request?.key ? result?.source : null;

  return (
    <div className="lab">
      <aside
        className={`lab-controls ${styles.controls}`}
        aria-label="Force lab controls"
      >
        <label className="lab-field">
          <span>Hold</span>
          <select
            value={choice}
            disabled={!schema}
            onChange={(e) => choose(e.target.value)}
          >
            <optgroup label="Hold Lab generators">
              {schema &&
                Object.entries(schema.kinds).map(([key, k]) => (
                  <option key={key} value={`kind:${key}`}>
                    {k.label} Lab
                  </option>
                ))}
            </optgroup>
            {pile.length > 0 && (
              <optgroup label="From the pile">
                {pile.map((p) => (
                  <option key={p.id} value={`pile:${p.id}`}>
                    {p.title} ({p.type})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        {shapeControls
          .filter((control) => control.key === "size")
          .map(shapeRow)}
        {pileHold && (
          <p className="lab-hint">
            {pileSource && (
              <>
                Size on the wall: {fmt(pileSource.dimensions[0], 1)} mm wide,{" "}
                {fmt(pileSource.dimensions[1], 1)} mm tall,{" "}
                {fmt(pileSource.dimensions[2], 1)} mm deep.{" "}
              </>
            )}
            Pile holds use the authored STL dimensions.
          </p>
        )}
        <div
          className="lab-tabs"
          role="tablist"
          aria-label="Force lab controls"
        >
          {TABS.map((name) => (
            <button
              type="button"
              key={name}
              role="tab"
              id={`force-tab-${name}`}
              aria-selected={tab === name}
              aria-controls={`force-panel-${name}`}
              tabIndex={tab === name ? 0 : -1}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
        </div>
        {TABS.map((name) => (
          <div
            key={name}
            className="lab-panel"
            role="tabpanel"
            id={`force-panel-${name}`}
            aria-labelledby={`force-tab-${name}`}
            hidden={tab !== name}
          >
            {name === "Pull" && (
              <>
                {PULL_ROWS.map((row) => (
                  <Row
                    key={row.key}
                    prefix="load"
                    spec={
                      row.key === "position"
                        ? { ...row, min: -halfWidth, max: halfWidth }
                        : row
                    }
                    value={loadValue(row.key)}
                    initial={loadInitial(row.key)}
                    disabled={!load}
                    onChange={changeLoad}
                  />
                ))}
                <div className={styles.pick}>
                  <button
                    type="button"
                    className="button button-outline"
                    aria-pressed={picking}
                    disabled={!result || viewerFailed}
                    onClick={() => setPicking((p) => !p)}
                  >
                    <Crosshair size={14} aria-hidden="true" />
                    {picking ? "Click the hold…" : "Pick the spot on the hold"}
                  </button>
                  {load?.point && (
                    <button
                      type="button"
                      className="button button-outline"
                      onClick={() =>
                        setLoad((c) => (c ? { ...c, point: null } : c))
                      }
                    >
                      <X size={14} aria-hidden="true" />
                      Clear
                    </button>
                  )}
                </div>
                <p className="lab-hint">
                  {load?.point
                    ? "The fingers bear on the spot you picked. Moving the position or height sliders goes back to them."
                    : "Or click the hold in the 3D view to put the fingers exactly where they go."}
                </p>
              </>
            )}
            {name === "Wall" && (
              <>
                <label className="lab-field">
                  <span>Wall material</span>
                  <select
                    value={wall}
                    disabled={!schema}
                    onChange={(e) => setWall(e.target.value)}
                  >
                    {schema &&
                      Object.entries(schema.materials.walls).map(([k, w]) => (
                        <option key={k} value={k}>
                          {w.label}
                        </option>
                      ))}
                  </select>
                </label>
                {schema && (
                  <p className="lab-hint">
                    {schema.materials.walls[wall].note}
                  </p>
                )}
                <Row
                  prefix="load"
                  spec={WALL_ANGLE}
                  value={loadValue("wall_angle")}
                  initial={loadInitial("wall_angle")}
                  disabled={!load}
                  onChange={changeLoad}
                />
              </>
            )}
            {name === "Hold" && (
              <>
                <label className="lab-field">
                  <span>Turn on the wall</span>
                  <select
                    value={turn}
                    disabled={!schema}
                    onChange={(e) => {
                      setTurn(Number(e.target.value));
                      setLoad((c) => (c ? { ...c, point: null } : c));
                      scene.current?.refit();
                    }}
                  >
                    {(schema?.turns ?? [0]).map((t) => (
                      <option key={t} value={t}>
                        {t === 0
                          ? "As designed"
                          : t === 180
                            ? "Upside down (180°)"
                            : `${t}°`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="lab-field">
                  <span>Printed in</span>
                  <select
                    value={hold}
                    disabled={!schema}
                    onChange={(e) => setHold(e.target.value)}
                  >
                    {schema &&
                      Object.entries(schema.materials.holds).map(([k, h]) => (
                        <option key={k} value={k}>
                          {h.label}
                        </option>
                      ))}
                  </select>
                </label>
                {schema && (
                  <p className="lab-hint">
                    {schema.materials.holds[hold].note}
                  </p>
                )}
                <label className="lab-field">
                  <span>Screw</span>
                  <select
                    value={screw}
                    disabled={!schema}
                    onChange={(e) => setScrew(e.target.value)}
                  >
                    {schema &&
                      Object.entries(schema.materials.screws).map(([k, sc]) => (
                        <option key={k} value={k}>
                          {sc.label}
                        </option>
                      ))}
                  </select>
                </label>
                {schema && (
                  <PullOut schema={schema} wall={wall} screw={screw} />
                )}
                <Row
                  prefix="hold"
                  spec={{
                    key: "screw_length",
                    label: "Screw length",
                    min: 20,
                    max: 100,
                    step: 1,
                    unit: "mm",
                    help: "Under the head to the tip. What is left past the seat bites into the wall.",
                  }}
                  value={screwLength}
                  initial={schema?.screw_length ?? 50}
                  disabled={!schema}
                  onChange={(_, v) => setScrewLength(v)}
                />
              </>
            )}
            {name === "Shape" && pileHold && (
              <p className="lab-hint">
                {pileSource &&
                  `${pileSource.holes} mounting ${pileSource.holes === 1 ? "hole was" : "holes were"} found. `}
                <Link href={`/holds/${pileHold.id}`}>Open its page.</Link>
              </p>
            )}
            {name === "Shape" && kind && kindSchema && kindSettings && (
              <>
                <label className="lab-field">
                  <span>Starting point</span>
                  <select
                    value={presets[kind] ?? ""}
                    onChange={(e) => applyPreset(e.target.value)}
                  >
                    <option value="">Default</option>
                    {Object.keys(kindSchema.presets).map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                {kindSchema.shapes && (
                  <label className="lab-field">
                    <span>{kindSchema.shapeLabel ?? "Body shape"}</span>
                    <select
                      value={String(kindSettings.shape)}
                      onChange={(e) => changeSetting("shape", e.target.value)}
                    >
                      {Object.entries(kindSchema.shapes).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {kindSchema.toggles
                  .filter((toggle) => toggle.group !== "Mounting")
                  .map((toggle) => (
                    <label className="lab-toggle" key={toggle.key}>
                      <input
                        type="checkbox"
                        checked={Boolean(kindSettings[toggle.key])}
                        onChange={(e) =>
                          changeSetting(toggle.key, e.target.checked)
                        }
                      />
                      {toggle.label}
                    </label>
                  ))}
                {shapeControls
                  .filter(
                    (control) =>
                      control.key !== "size" && control.group !== "Mounting",
                  )
                  .map(shapeRow)}
                {Object.entries(kindSettings)
                  .filter(
                    ([key, value]) =>
                      typeof value === "boolean" &&
                      key !== "screws" &&
                      !kindSchema.toggles.some(
                        (toggle) =>
                          toggle.key === key && toggle.group !== "Mounting",
                      ),
                  )
                  .map(([key, value]) => (
                    <label className="lab-toggle" key={key}>
                      <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(e) => changeSetting(key, e.target.checked)}
                      />
                      {SWITCHES[key] ??
                        kindSchema.toggles.find((t) => t.key === key)?.label ??
                        key.replace(/_/g, " ")}
                    </label>
                  ))}
                {shapeControls
                  .filter((control) => control.group === "Mounting")
                  .map(shapeRow)}
              </>
            )}
          </div>
        ))}
        <p className="small-note">
          A first-order model to compare set-ups. Strengths are typical failure
          values, not ratings for a printed hold, a screw or a wall.
        </p>
      </aside>

      <section className="lab-stage" aria-label="Force model">
        <div className="lab-stage-preview">
          <div className="lab-toolbar" role="group" aria-label="Colour by">
            {MODES.map(([name, label]) => (
              <button
                type="button"
                key={name}
                aria-pressed={mode === name}
                onClick={() => setMode(name)}
              >
                {label}
              </button>
            ))}
            {VIEWS.map(([name, label], index) => (
              <button
                type="button"
                key={name}
                className={index === 0 ? "lab-toolbar-end" : undefined}
                aria-pressed={view === name}
                onClick={() => {
                  setView(name);
                  scene.current?.setView(name);
                }}
              >
                {label}
              </button>
            ))}
            <label className={`lab-toggle ${styles.xray}`}>
              <input
                type="checkbox"
                checked={xray}
                onChange={(e) => setXray(e.target.checked)}
              />
              See-through
            </label>
          </div>
          <div
            ref={box}
            className={`lab-viewer ${picking ? styles.picking : ""}`}
            role="img"
            aria-label={`Interactive 3D force model of the hold on its wall. ${VIEWER_CONTROLS}`}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
          >
            {viewerFailed && (
              <p className="lab-viewer-note">
                {NO_3D_HELP} The forces below still work.
              </p>
            )}
            {result && <Legend result={result} mode={mode} />}
          </div>
          <div className="lab-board-controls">
            <label htmlFor="force-cut">Inside the hold</label>
            <select
              id="force-cut"
              value={cutAxis}
              onChange={(e) => chooseCut(e.target.value as CutAxis)}
            >
              {CUTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {cutAxis !== "none" && bounds && (
              <>
                <input
                  type="range"
                  aria-label={
                    cutAxis === "x" ? "Cut position across" : "Layer height"
                  }
                  min={Math.floor(bounds.min[cutAxisIndex])}
                  max={Math.ceil(bounds.max[cutAxisIndex])}
                  step={0.5}
                  value={cutAt}
                  onChange={(e) => setCutAt(e.target.valueAsNumber)}
                />
                <span className={styles.cutValue}>
                  {cutAxis === "x"
                    ? `${fmt(cutAt, 1)} mm across`
                    : `${fmt(cutAt, 1)} mm off the wall`}
                </span>
              </>
            )}
            <p>
              {cutAxis === "x"
                ? "Cuts the hold across to show the stress inside its side profile."
                : cutAxis === "z"
                  ? "Shows one print layer: red is where the layers are pulled apart."
                  : "Cut the hold open to see the stress inside it."}
            </p>
          </div>
          <p className="lab-caption">
            <span>Drag to turn · Shift to pan · scroll or pinch to zoom</span>
            <span>
              {result
                ? result.load.wall_angle === 0
                  ? "Vertical wall"
                  : result.load.wall_angle > 0
                    ? `${result.load.wall_angle}° overhang`
                    : `${-result.load.wall_angle}° slab`
                : ""}
            </span>
          </p>
        </div>
        <div
          className={`lab-stage-row ${status.error ? "lab-stage-error" : ""}`}
        >
          <div className={`lab-status ${status.error ? "error" : ""}`}>
            <p role="status" aria-live="polite">
              {status.text}
            </p>
          </div>
        </div>
      </section>

      <div className={`lab-details ${styles.details}`}>
        {result ? (
          <>
            <Verdict result={result} />
            <Fasteners result={result} />
            <Checks result={result} />
            <LayerChart result={result} />
            <BackMap result={result} image={backImage} />
            <About />
          </>
        ) : (
          <section className="lab-card">
            <h3>Results</h3>
            <p className="small-note">
              The results appear once the model has solved.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function Row({
  prefix,
  spec,
  value,
  initial,
  disabled,
  onChange,
}: {
  prefix: string;
  spec: RowSpec;
  value: number;
  initial: number;
  disabled: boolean;
  onChange: (key: string, value: number) => void;
}) {
  return (
    <ControlRow
      id={`force-${prefix}-${spec.key}`}
      control={
        spec.shown
          ? { ...spec, help: `${spec.shown(value)}. ${spec.help}` }
          : spec
      }
      value={value}
      disabled={disabled}
      clamp
      onChange={onChange}
      onReset={() => onChange(spec.key, initial)}
    />
  );
}
function Legend({ result, mode }: { result: Analysis; mode: Mode }) {
  if (mode === "stress") {
    const range = stressScale(result.mesh.sigma);
    return (
      <div className={styles.legend}>
        <b>Stress across the print layers</b>
        <i style={{ background: gradient((t) => diverging(t), -1, 1) }} />
        <span className={styles.ticks}>
          <span>−{fmt(range, 2)}</span>
          <span>0 MPa</span>
          <span>+{fmt(range, 2)}</span>
        </span>
        <span>
          Pushed together · pulled apart. The ring marks the most stressed spot.
        </span>
      </div>
    );
  }
  if (mode === "use")
    return (
      <div className={styles.legend}>
        <b>Layer strength used ({result.hold.label})</b>
        <i style={{ background: gradient((t) => ramp(t)) }} />
        <span className={styles.ticks}>
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </span>
        <span>The ring marks the peak: {pct(result.summary.peak.use)}</span>
      </div>
    );
  return (
    <div className={styles.legend}>
      <b>Wall pressure under the back</b>
      <i style={{ background: gradient((t) => ramp(t)) }} />
      <span className={styles.ticks}>
        <span>0</span>
        <span>{fmt(result.wall.crush / 2, 1)}</span>
        <span>{fmt(result.wall.crush, 1)} MPa</span>
      </span>
      <span>Right end: the face crushes. Grey: back lifted off.</span>
    </div>
  );
}

function Verdict({ result }: { result: Analysis }) {
  const s = result.summary;
  const force = result.load.force;
  const margin = s.safety;
  const tone =
    margin == null
      ? ""
      : margin >= 2
        ? styles.good
        : margin >= 1
          ? styles.warn
          : styles.bad;
  return (
    <section className={`lab-card ${styles.verdict} ${tone}`}>
      <h3>Verdict</h3>
      <p className={styles.big}>
        {force <= 0 ? (
          "No pull applied."
        ) : margin != null && margin >= 1 ? (
          <>
            Holds <strong>{fmt(force)} N</strong> ({kg(force)} kg) with a{" "}
            <strong>{fmt(margin, 1)}×</strong> margin.
          </>
        ) : (
          <>
            Fails before <strong>{fmt(force)} N</strong>: about{" "}
            <strong>{fmt(s.failure_force ?? 0)} N</strong> is the limit.
          </>
        )}
      </p>
      <p className="small-note">
        First to give way: <b>{s.governing.part}</b>,{" "}
        {s.governing.mode.toLowerCase()}
        {s.failure_force
          ? `, at about ${fmt(s.failure_force)} N (${kg(s.failure_force)} kg).`
          : "."}
      </p>
      <dl className="lab-metrics">
        <Metric label="Screws pulling" value={`${fmt(s.total_tension)} N`} />
        <Metric label="Wall pushing back" value={`${fmt(s.contact_force)} N`} />
        <Metric label="Back lifted off" value={`${fmt(s.lifted * 100)}%`} />
        <Metric
          label={`Peak wall pressure (crushes at ${fmt(result.wall.crush, 1)})`}
          value={`${fmt(s.max_pressure, 2)} MPa`}
        />
        <Metric
          label={`Peak layer stress (${fmt(s.worst_layer.z, 1)} mm off the wall)`}
          value={`${fmt(s.worst_layer.sigma, 2)} MPa`}
        />
        <Metric
          label="Pull out of the wall"
          value={`${fmt(result.load.components[2])} N`}
        />
        <Metric
          label="Pull down the wall"
          value={`${fmt(-result.load.components[1])} N`}
        />
        {result.load.components[0] !== 0 && (
          <Metric
            label="Pull along the hold"
            value={`${fmt(Math.abs(result.load.components[0]))} N`}
          />
        )}
      </dl>
      {result.notes.map((note) => (
        <p key={note} className={`small-note ${styles.note}`}>
          {note}
        </p>
      ))}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Fasteners({ result }: { result: Analysis }) {
  const first = result.fasteners[0];
  return (
    <section className="lab-card">
      <h3>Screws</h3>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Fastener</th>
              <th scope="col">Pull</th>
              <th scope="col">Sideways</th>
              <th scope="col">Wall grip</th>
              <th scope="col">Seat</th>
              <th scope="col">Used</th>
            </tr>
          </thead>
          <tbody>
            {result.fasteners.map((f) => (
              <tr key={f.name}>
                <th scope="row">
                  <span
                    className={styles.swatch}
                    style={{ background: css(ramp(f.governing)) }}
                    aria-hidden="true"
                  />
                  {f.name}
                </th>
                <td>{fmt(f.tension)} N</td>
                <td>{fmt(f.shear)} N</td>
                <td>{fmt(f.capacity.wall)} N</td>
                <td>{fmt(f.seat, 1)} mm</td>
                <td>{pct(f.governing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small-note">
        {result.wall.anchor_pullout
          ? "Concrete anchors: pull-out is per anchor."
          : `${fmt(result.screw_length)} mm ${result.screw.label.split(" (")[0]}s, ${fmt(first.thread, 1)} mm of thread in the wall at ${fmt(result.screw.pullout_per_mm)} N per mm.`}
      </p>
    </section>
  );
}

function Checks({ result }: { result: Analysis }) {
  return (
    <section className="lab-card">
      <h3>First things to give way</h3>
      <ol className={styles.checks}>
        {result.checks.slice(0, 6).map((c) => (
          <li key={`${c.part}-${c.mode}`}>
            <span>
              <b>{c.part}</b>: {c.mode}
            </span>
            <span className={styles.value}>{pct(c.use)}</span>
            <span className={styles.meter} aria-hidden="true">
              <i
                style={{
                  width: `${Math.min(100, c.use * 100)}%`,
                  background: css(ramp(c.use)),
                }}
              />
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function LayerChart({ result }: { result: Analysis }) {
  const rows = result.layers;
  const W = 320;
  const H = 170;
  const left = 34;
  const right = 10;
  const top = 12;
  const bottom = 26;
  const zMax = Math.max(1, ...rows.map((d) => d.z));
  const sMax = Math.max(0.01, ...rows.map((d) => Math.max(d.sigma, d.tau)));
  const x = (s: number) => left + (Math.max(0, s) / sMax) * (W - left - right);
  const y = (z: number) => H - bottom - (z / zMax) * (H - top - bottom);
  const line = (key: "sigma" | "tau") =>
    rows
      .map(
        (d, i) =>
          `${i ? "L" : "M"}${x(d[key]).toFixed(1)},${y(d.z).toFixed(1)}`,
      )
      .join("");
  return (
    <section className="lab-card">
      <h3>Layer stress up the hold</h3>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Peak stress in each print layer by height off the wall"
      >
        <line
          className={styles.axis}
          x1={left}
          y1={H - bottom}
          x2={W - right}
          y2={H - bottom}
        />
        <line
          className={styles.axis}
          x1={left}
          y1={top}
          x2={left}
          y2={H - bottom}
        />
        {[0, 0.5, 1].map((t) => (
          <text key={t} x={x(t * sMax)} y={H - bottom + 12} textAnchor="middle">
            {fmt(t * sMax, 2)}
          </text>
        ))}
        <text x={W - right} y={H - 3} textAnchor="end">
          MPa
        </text>
        <text x={left - 4} y={y(zMax) + 3} textAnchor="end">
          {fmt(zMax)}
        </text>
        <text x={left - 4} y={y(0) + 3} textAnchor="end">
          0
        </text>
        <text x={2} y={top - 2}>
          mm off the wall
        </text>
        <path
          d={line("sigma")}
          fill="none"
          stroke={TENSION_CSS}
          strokeWidth={2}
        />
        <path
          d={line("tau")}
          fill="none"
          className={styles.shear}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <text
          x={W - right}
          y={top + 6}
          textAnchor="end"
          style={{ fill: TENSION_CSS }}
        >
          pulling apart
        </text>
        <text
          x={W - right}
          y={top + 18}
          textAnchor="end"
          className={styles.shearText}
        >
          sliding
        </text>
      </svg>
    </section>
  );
}

function BackMap({ result, image }: { result: Analysis; image?: string }) {
  const p = result.pressure;
  const W = 320;
  const H = 170;
  const pad = 14;
  const w = p.nx * p.step;
  const h = p.ny * p.step;
  const k = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h);
  const ox = (W - w * k) / 2;
  const oy = (H - h * k) / 2;
  const X = (v: number) => ox + (v - (p.x0 - p.step / 2)) * k;
  const Y = (v: number) => oy + h * k - (v - (p.y0 - p.step / 2)) * k;
  const [px, py] = result.load.point;
  return (
    <section className="lab-card">
      <h3>Back on the wall</h3>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Contact pressure under the back, with the screw positions"
      >
        {image && (
          <image
            href={image}
            x={ox}
            y={oy}
            width={w * k}
            height={h * k}
            preserveAspectRatio="none"
            style={{ imageRendering: "pixelated" }}
          />
        )}
        {result.fasteners.map((f) => (
          <g key={f.name}>
            <circle
              cx={X(f.x)}
              cy={Y(f.y)}
              r={(f.head / 2) * k}
              fill={css(ramp(f.governing))}
              className={styles.screw}
            />
            <text
              x={X(f.x)}
              y={Y(f.y) - (f.head / 2) * k - 3}
              textAnchor="middle"
            >
              {fmt(f.tension)} N
            </text>
          </g>
        ))}
        <circle cx={X(px)} cy={Y(py)} r={3} className={styles.contact} />
        <text x={W - 4} y={H - 3} textAnchor="end">
          up the wall ↑
        </text>
      </svg>
      <p className="small-note">
        Coloured: where the back presses on the wall. The dot is under the
        fingers.
      </p>
    </section>
  );
}

function About() {
  return (
    <section className="lab-card">
      <h3>How this is worked out</h3>
      <ul className={styles.about}>
        <li>
          The hold is a rigid body on its flat back. The wall pushes back only
          where the back is pressed in, and the screws only pull, with no
          preload.
        </li>
        <li>
          Forces along the wall are shared by the screws in shear: equally, plus
          a twist when the pull is off to one side.
        </li>
        <li>
          The hold is cut into slices parallel to the wall, its print layers
          when printed back-down. Each carries the pull and the screw heads
          above it. Stress around holes and corners is not modelled.
        </li>
        <li>
          Strengths are typical failure values, not design values. Compare
          set-ups with it; do not rate a hold by it.
        </li>
      </ul>
    </section>
  );
}

// What each screw holds in the chosen wall before its thread pulls out, per
// mm of thread and through the whole sheet (Wood Handbook, see
// tools/jug-force-lab/materials.py).
function PullOut({
  schema,
  wall,
  screw,
}: {
  schema: ForceSchema;
  wall: string;
  screw: string;
}) {
  const w = schema.materials.walls[wall];
  const rows = schema.materials.pullout_per_mm[wall];
  if (w.anchor_pullout)
    return (
      <p className="lab-hint">
        {schema.materials.screws[screw].note} In concrete the anchor sets the
        pull-out: about {fmt(w.anchor_pullout)} N each.
      </p>
    );
  return (
    <div className="lab-hint">
      <p>{schema.materials.screws[screw].note}</p>
      <table className={styles.table}>
        <caption className={styles.caption}>
          Pull-out from {w.label}, typical failure
        </caption>
        <thead>
          <tr>
            <th scope="col">Screw</th>
            <th scope="col">Per mm</th>
            <th scope="col">Through {fmt(w.thickness)} mm</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(schema.materials.screws).map(([key, s]) => (
            <tr key={key} aria-current={key === screw ? "true" : undefined}>
              <th scope="row">{s.label.split(" (")[0]}</th>
              <td>{fmt(rows[key])} N</td>
              <td>
                {fmt(rows[key] * w.thickness)} N · {kg(rows[key] * w.thickness)}{" "}
                kg
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
