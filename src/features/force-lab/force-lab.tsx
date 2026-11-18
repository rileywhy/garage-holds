"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { Control, Parameters } from "@/features/hold-lab/api";
import { isDarkTheme } from "@/features/model-viewer/viewer";
import { VIEWER_CONTROLS } from "@/features/model-viewer/gestures";
import {
  analyze,
  fetchSchema,
  type Analysis,
  type ForceSchema,
  type Load,
} from "./api";
import { TENSION_CSS, css, diverging, gradient, ramp } from "./colours";
import { ForceScene, holdGeometry, type Mode, type View } from "./scene";
import styles from "./force-lab.module.css";

// An unlisted page: a Jug Lab hold on a wall, a pull you set, and where the
// force goes. The model and every figure live in tools/jug-force-lab.

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
const TOGGLES: [string, string][] = [
  ["bolt_mount", "Bolt + one screw"],
  ["auto_seat", "Automatic screw seat"],
  ["auto_spacing", "Automatic screw spacing"],
];

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

const LOAD_ROWS: Record<"pull" | "wall", RowSpec[]> = {
  pull: [
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
      label: "Pull out from the wall",
      min: -30,
      max: 60,
      step: 1,
      unit: "°",
      help: "0 is straight down. More leans the pull out, like a body swinging away below.",
    },
    {
      key: "side_angle",
      label: "Side pull",
      min: -60,
      max: 60,
      step: 1,
      unit: "°",
      help: "Swings the pull along the hold, as in a gaston or a cross-through.",
    },
    {
      key: "position",
      label: "Hand position across",
      min: -80,
      max: 80,
      step: 1,
      unit: "mm",
      help: "Where along the hold the hand sits. 0 is the middle.",
    },
    {
      key: "depth",
      label: "Finger depth in the grip",
      min: 0,
      max: 95,
      step: 1,
      unit: "%",
      help: "0 is on top of the lip; higher sinks the fingers down the incut toward the wall.",
    },
  ],
  wall: [
    {
      key: "wall_angle",
      label: "Wall angle",
      min: -15,
      max: 90,
      step: 1,
      unit: "°",
      help: "Past vertical: 0 is a vertical wall, 40 a typical board, 90 a roof.",
      shown: (v) => (v === 0 ? "vertical" : v > 0 ? "overhang" : "slab"),
    },
  ],
};

export function ForceLab() {
  const box = useRef<HTMLDivElement>(null);
  const scene = useRef<ForceScene | null>(null);
  const meshKey = useRef("");
  const [schema, setSchema] = useState<ForceSchema | null>(null);
  const [tab, setTab] = useState<Tab>("Pull");
  const [load, setLoad] = useState<Load | null>(null);
  const [wall, setWall] = useState("plywood_18");
  const [hold, setHold] = useState("pla");
  const [screwLength, setScrewLength] = useState(50);
  const [screw, setScrew] = useState("no10");
  const [settings, setSettings] = useState<Parameters>({});
  const [preset, setPreset] = useState("");
  const [mode, setMode] = useState<Mode>("stress");
  const [xray, setXray] = useState(false);
  const [view, setView] = useState<View>("three");
  const [result, setResult] = useState<Analysis | null>(null);
  const [backImage, setBackImage] = useState<string>();
  const [status, setStatus] = useState({
    text: "Loading the model…",
    error: false,
  });
  const [viewerFailed, setViewerFailed] = useState(false);

  // The schema, then the first analysis.
  useEffect(() => {
    const controller = new AbortController();
    fetchSchema(controller.signal)
      .then((s) => {
        setSchema(s);
        setLoad(s.load.defaults);
        setScrewLength(s.screw_length);
        setScrew(s.screw);
        setSettings({ ...s.jug.defaults });
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

  // Re-solve shortly after anything changes; a newer request cancels an
  // older one. The mesh is fetched only when the hold's shape changed.
  useEffect(() => {
    if (!schema || !load) return;
    const controller = new AbortController();
    const key = JSON.stringify(settings);
    const timer = setTimeout(async () => {
      setStatus({ text: "Solving…", error: false });
      try {
        const needMesh = meshKey.current !== key;
        const next = await analyze(
          {
            settings,
            load,
            wall,
            hold,
            screw,
            screw_length: screwLength,
            mesh: needMesh,
          },
          controller.signal,
        );
        const geometry =
          next.mesh.vertices && next.mesh.faces
            ? holdGeometry(next.mesh.vertices, next.mesh.faces)
            : undefined;
        if (geometry) meshKey.current = key;
        scene.current?.show(next, geometry);
        setBackImage(scene.current?.pressureImage());
        setResult(next);
        const count = next.fasteners.length;
        setStatus({
          text: `${count} ${count === 1 ? "fastener" : "fasteners"} · ${next.wall.label} · ${next.hold.label}`,
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
  }, [schema, load, wall, hold, screw, screwLength, settings]);

  useEffect(() => scene.current?.setMode(mode, xray), [mode, xray]);

  const halfWidth = useMemo(() => {
    const p = result?.parameters;
    if (!p) return 80;
    return Math.max(
      20,
      Math.floor((Number(p.width) * Number(p.size ?? 100)) / 200 - 4),
    );
  }, [result?.parameters]);

  function changeLoad(key: string, value: number) {
    setLoad((current) =>
      current
        ? { ...current, [key]: key === "depth" ? value / 100 : value }
        : current,
    );
  }

  function applyPreset(name: string) {
    if (!schema) return;
    setPreset(name);
    setSettings({ ...(name ? schema.jug.presets[name] : schema.jug.defaults) });
    scene.current?.refit();
  }

  const loadValue = (key: string) =>
    load
      ? key === "depth"
        ? Math.round(load.depth * 100)
        : (load[key as keyof Load] as number)
      : 0;

  return (
    <div className="lab">
      <aside className="lab-controls" aria-label="Force lab controls">
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
            {name === "Pull" &&
              LOAD_ROWS.pull.map((row) => (
                <Row
                  key={row.key}
                  spec={
                    row.key === "position"
                      ? { ...row, min: -halfWidth, max: halfWidth }
                      : row
                  }
                  value={loadValue(row.key)}
                  initial={
                    schema
                      ? row.key === "depth"
                        ? schema.load.defaults.depth * 100
                        : (schema.load.defaults[
                            row.key as keyof Load
                          ] as number)
                      : 0
                  }
                  disabled={!load}
                  onChange={changeLoad}
                />
              ))}
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
                {LOAD_ROWS.wall.map((row) => (
                  <Row
                    key={row.key}
                    spec={row}
                    value={loadValue(row.key)}
                    initial={schema?.load.defaults.wall_angle ?? 0}
                    disabled={!load}
                    onChange={changeLoad}
                  />
                ))}
              </>
            )}
            {name === "Hold" && (
              <>
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
            {name === "Shape" && schema && (
              <>
                <label className="lab-field">
                  <span>Jug Lab starting point</span>
                  <select
                    value={preset}
                    onChange={(e) => applyPreset(e.target.value)}
                  >
                    <option value="">Default</option>
                    {Object.keys(schema.jug.presets).map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                {TOGGLES.map(([key, label]) => (
                  <label className="lab-toggle" key={key}>
                    <input
                      type="checkbox"
                      checked={Boolean(settings[key])}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, [key]: e.target.checked }))
                      }
                    />
                    {label}
                  </label>
                ))}
                {schema.jug.controls.map((control: Control) => (
                  <Row
                    key={control.key}
                    spec={control}
                    value={Number(settings[control.key])}
                    initial={Number(schema.jug.defaults[control.key])}
                    disabled={false}
                    onChange={(key, v) =>
                      setSettings((s) => ({ ...s, [key]: v }))
                    }
                  />
                ))}
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
            className="lab-viewer"
            role="img"
            aria-label={`Interactive 3D force model of the jug on its wall. ${VIEWER_CONTROLS}`}
          >
            {viewerFailed && (
              <p className="lab-viewer-note">
                This browser could not start the 3D view.
              </p>
            )}
            {result && <Legend result={result} mode={mode} />}
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
  spec,
  value,
  initial,
  disabled,
  onChange,
}: {
  spec: RowSpec | Control;
  value: number;
  initial: number;
  disabled: boolean;
  onChange: (key: string, value: number) => void;
}) {
  const id = `force-${spec.key}`;
  const shown = "shown" in spec ? spec.shown : undefined;
  const set = (v: number) => {
    if (!Number.isFinite(v)) return;
    onChange(spec.key, Math.min(spec.max, Math.max(spec.min, v)));
  };
  return (
    <div className="lab-control">
      <div className="lab-control-head">
        <label htmlFor={id}>{spec.label}</label>
        <span className="lab-number">
          <input
            id={id}
            type="number"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={Number.isFinite(value) ? value : ""}
            disabled={disabled}
            aria-describedby={`${id}-hint`}
            onChange={(e) => {
              const v = e.currentTarget.valueAsNumber;
              if (v >= spec.min && v <= spec.max) set(v);
            }}
            onBlur={(e) => set(e.currentTarget.valueAsNumber)}
          />
          <span>{spec.unit}</span>
          <button
            type="button"
            className="lab-control-reset"
            disabled={disabled}
            aria-label={`Reset ${spec.label}`}
            title={`Reset ${spec.label}`}
            onClick={() => onChange(spec.key, initial)}
          >
            <RotateCcw size={14} aria-hidden="true" />
          </button>
        </span>
      </div>
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={Number.isFinite(value) ? value : spec.min}
        disabled={disabled}
        aria-label={`${spec.label} slider`}
        aria-describedby={`${id}-hint`}
        onChange={(e) => set(e.target.valueAsNumber)}
        onDoubleClick={() => onChange(spec.key, initial)}
      />
      <p className="lab-hint" id={`${id}-hint`}>
        {shown ? <strong>{shown(value)}. </strong> : null}
        {spec.help}
      </p>
    </div>
  );
}

function Legend({ result, mode }: { result: Analysis; mode: Mode }) {
  if (mode === "stress") {
    let range = 1e-6;
    for (const s of result.mesh.sigma) range = Math.max(range, Math.abs(s));
    return (
      <div className={styles.legend}>
        <b>Stress across the print layers</b>
        <i style={{ background: gradient((t) => diverging(t), -1, 1) }} />
        <span className={styles.ticks}>
          <span>−{fmt(range, 2)}</span>
          <span>0 MPa</span>
          <span>+{fmt(range, 2)}</span>
        </span>
        <span>Pushed together · pulled apart</span>
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
        <span>Peak in the hold: {pct(result.summary.worst_layer.use)}</span>
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
