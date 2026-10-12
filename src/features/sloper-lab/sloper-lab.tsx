"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, RotateCcw, Shuffle } from "lucide-react";
import {
  Viewer,
  isDarkTheme,
  type ViewName,
} from "@/features/model-viewer/viewer";
import {
  DEFAULT_BOARD_ANGLE,
  MAX_BOARD_ANGLE,
} from "@/features/model-viewer/board-preview";
import { previewGeometry } from "@/features/crimp-lab/preview-geometry";
import {
  DESIGN_FILE_LIMIT,
  loadSchema,
  parseDesignFile,
  post,
  type Control,
  type Design,
  type Parameters,
  type Preview,
  type Schema,
} from "./api";
import { Profile } from "./profile";

const GROUPS = ["Grip", "Shape", "Mounting"] as const;
type Group = (typeof GROUPS)[number];
const VIEWS: [ViewName, string][] = [
  ["three-quarter", "3d"],
  ["board", "board preview"],
  ["side", "side"],
  ["top", "above"],
  ["front", "front"],
];

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SloperLab() {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [parameters, setParameters] = useState<Parameters>({});
  const latest = useRef<Parameters>({});
  const [revision, setRevision] = useState(0);
  const [preset, setPreset] = useState("");
  const [group, setGroup] = useState<Group>("Grip");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [design, setDesign] = useState<Design | null>(null);
  const [status, setStatus] = useState({
    text: "loading generator…",
    error: false,
  });
  const [exporting, setExporting] = useState(false);
  const [view, setView] = useState<ViewName>("three-quarter");
  const [boardAngle, setBoardAngle] = useState(DEFAULT_BOARD_ANGLE);
  const box = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const fitNext = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadSchema()
      .then((loaded) => {
        if (cancelled) return;
        latest.current = { ...loaded.defaults };
        setParameters(latest.current);
        setPreset(Object.keys(loaded.presets)[0] ?? "custom");
        setSchema(loaded);
      })
      .catch((error: Error) => {
        if (!cancelled) setStatus({ text: error.message, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!box.current) return;
    viewer.current = new Viewer(box.current, { dark: isDarkTheme() });
    return () => {
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, []);

  useEffect(() => {
    if (!schema) return;
    const request = ++sequence.current;
    const timer = setTimeout(async () => {
      controller.current?.abort();
      controller.current = new AbortController();
      try {
        const data = (await (
          await post("preview", latest.current, controller.current.signal)
        ).json()) as Preview;
        if (request !== sequence.current) return;
        viewer.current?.setGeometry(previewGeometry(data), fitNext.current);
        fitNext.current = false;
        latest.current = { ...data.parameters };
        setParameters(latest.current);
        setPreview(data);
        setDesign(data.design);
        const notes = Object.entries(data.adjusted).map(
          ([key, value]) =>
            `${schema.controls.find((c) => c.key === key)?.label ?? key}: ${Number(value.toFixed(2))}`,
        );
        setStatus({
          text: notes.length
            ? `preview is current. adjusted to fit — ${notes.join("; ")}.`
            : "preview is current. export builds a finer mesh.",
          error: false,
        });
      } catch (error) {
        if (
          (error as Error).name !== "AbortError" &&
          request === sequence.current
        )
          setStatus({
            text: `${(error as Error).message} showing the last valid model.`,
            error: true,
          });
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.current?.abort();
    };
  }, [schema, revision]);

  const edit = useCallback(
    (next: (p: Parameters) => Parameters, name = "custom", fit = false) => {
      ++sequence.current;
      controller.current?.abort();
      latest.current = next(latest.current);
      setParameters(latest.current);
      setPreset(name);
      setDesign(null);
      setStatus({ text: "updating preview…", error: false });
      fitNext.current = fitNext.current || fit;
      setRevision((r) => r + 1);
    },
    [],
  );
  const change = useCallback(
    (key: string, value: number | boolean) =>
      edit((p) => ({ ...p, [key]: value })),
    [edit],
  );

  function changeBoardAngle(angle: number) {
    if (!Number.isFinite(angle) || angle < 0 || angle > MAX_BOARD_ANGLE) return;
    setBoardAngle(angle);
    viewer.current?.setBoardAngle(angle);
  }
  function reset() {
    if (!schema) return;
    changeBoardAngle(DEFAULT_BOARD_ANGLE);
    edit(() => ({ ...schema.defaults }), Object.keys(schema.presets)[0], true);
  }
  function variation(seed: number) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 999999) return;
    edit((p) => ({
      ...p,
      seed,
      character: Math.max(0.65, Number(p.character)),
    }));
  }
  async function loadSettings(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > DESIGN_FILE_LIMIT)
        throw new Error("settings files must be smaller than 16 KB.");
      const saved = parseDesignFile(await file.text());
      const data = (await (await post("validate", saved)).json()) as {
        parameters: Parameters;
      };
      edit(() => data.parameters, "custom", true);
    } catch (error) {
      setStatus({ text: (error as Error).message, error: true });
    }
  }
  async function exportStl() {
    if (!design) return;
    const snapshot = { ...design.parameters },
      request = sequence.current;
    setExporting(true);
    setStatus({ text: "building a fine STL…", error: false });
    try {
      download(
        await (await post("stl", snapshot)).blob(),
        `sloper-${snapshot.width}mm.stl`,
      );
      if (request === sequence.current)
        setStatus({
          text: "STL downloaded. save settings to keep it editable.",
          error: false,
        });
    } catch (error) {
      if (request === sequence.current)
        setStatus({ text: (error as Error).message, error: true });
    } finally {
      setExporting(false);
    }
  }

  const screws = Boolean(parameters.screws);
  return (
    <div className="lab">
      <aside className="lab-controls" aria-label="Sloper controls">
        <label className="lab-field">
          <span>starting point</span>
          <select
            value={preset}
            disabled={!schema}
            onChange={(event) => {
              const name = event.target.value;
              if (schema) edit(() => ({ ...schema.presets[name] }), name, true);
            }}
          >
            {schema &&
              Object.keys(schema.presets).map((name) => (
                <option key={name}>{name}</option>
              ))}
            <option value="custom" disabled>
              custom
            </option>
          </select>
        </label>
        <div className="lab-tabs" role="tablist" aria-label="Design controls">
          {GROUPS.map((name, index) => (
            <button
              type="button"
              key={name}
              role="tab"
              id={`sloper-tab-${name}`}
              aria-selected={group === name}
              aria-controls={`sloper-panel-${name}`}
              tabIndex={group === name ? 0 : -1}
              onClick={() => setGroup(name)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 2
                      : (index + (event.key === "ArrowRight" ? 1 : -1) + 3) % 3;
                setGroup(GROUPS[next]);
                document.getElementById(`sloper-tab-${GROUPS[next]}`)?.focus();
              }}
            >
              {name.toLowerCase()}
            </button>
          ))}
        </div>
        {schema &&
          GROUPS.map((name) => (
            <div
              key={name}
              className="lab-panel"
              role="tabpanel"
              id={`sloper-panel-${name}`}
              aria-labelledby={`sloper-tab-${name}`}
              hidden={group !== name}
            >
              {name === "Mounting" && (
                <>
                  <label className="lab-toggle">
                    <input
                      type="checkbox"
                      checked={screws}
                      onChange={(e) => change("screws", e.target.checked)}
                    />
                    screw-on mounting holes
                  </label>
                  <label className="lab-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(parameters.auto_seat)}
                      disabled={!screws}
                      onChange={(e) => change("auto_seat", e.target.checked)}
                    />
                    automatic screw seat
                  </label>
                </>
              )}
              {schema.controls
                .filter((c) => c.group === name)
                .map((control) => (
                  <ControlRow
                    key={control.key}
                    control={control}
                    value={Number(parameters[control.key])}
                    disabled={
                      name === "Mounting" &&
                      (!screws ||
                        (control.key === "seat_depth" &&
                          Boolean(parameters.auto_seat)))
                    }
                    onChange={change}
                  />
                ))}
              {name === "Shape" && (
                <div className="lab-seed">
                  <label className="lab-field">
                    <span>variation seed</span>
                    <div className="lab-seed-row">
                      <input
                        type="number"
                        min={0}
                        max={999999}
                        step={1}
                        value={Number(parameters.seed)}
                        onChange={(e) => variation(e.target.valueAsNumber)}
                      />
                      <button
                        className="button button-outline"
                        type="button"
                        onClick={() =>
                          variation(
                            (Number(latest.current.seed) +
                              1 +
                              (crypto.getRandomValues(new Uint32Array(1))[0] %
                                999999)) %
                              1000000,
                          )
                        }
                      >
                        <Shuffle size={15} />
                        new variation
                      </button>
                    </div>
                  </label>
                  <p className="lab-hint">
                    Different rounded surfaces. Reset returns to the clean
                    default.
                  </p>
                </div>
              )}
            </div>
          ))}
        <div className="lab-settings-row">
          <button
            className="button button-outline"
            type="button"
            disabled={!design}
            onClick={() => {
              if (design)
                download(
                  new Blob([JSON.stringify(design, null, 2)], {
                    type: "application/json",
                  }),
                  `sloper-${design.parameters.width}mm.json`,
                );
            }}
          >
            save settings
          </button>
          <button
            className="button button-outline"
            type="button"
            disabled={!schema}
            onClick={() => fileInput.current?.click()}
          >
            load settings
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label="Load a settings file"
            onChange={(e) => {
              loadSettings(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        <p className="small-note">
          Geometry prototype. Mesh checks confirm a closed shape, not a printed
          hold’s strength.
        </p>
      </aside>
      <section className="lab-stage" aria-label="Model preview">
        <div className="lab-toolbar" role="group" aria-label="Preview angle">
          {VIEWS.map(([name, label]) => (
            <button
              type="button"
              key={name}
              aria-pressed={view === name}
              onClick={() => {
                setView(name);
                viewer.current?.setView(name);
              }}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="lab-toolbar-end"
            onClick={() => viewer.current?.fit()}
          >
            fit view
          </button>
          <button type="button" disabled={!schema} onClick={reset}>
            <RotateCcw size={13} />
            reset
          </button>
        </div>
        {view === "board" && (
          <div className="lab-board-controls">
            <label htmlFor="sloper-board-angle">board angle</label>
            <input
              id="sloper-board-angle"
              type="number"
              min={0}
              max={MAX_BOARD_ANGLE}
              value={boardAngle}
              onChange={(e) => changeBoardAngle(e.target.valueAsNumber)}
            />
            <span>°</span>
            <input
              type="range"
              min={0}
              max={MAX_BOARD_ANGLE}
              value={boardAngle}
              aria-label="Board angle slider"
              onChange={(e) => changeBoardAngle(e.target.valueAsNumber)}
            />
            <button
              type="button"
              onClick={() => changeBoardAngle(DEFAULT_BOARD_ANGLE)}
            >
              40° standard
            </button>
            <button
              type="button"
              onClick={() => viewer.current?.setBoardSideView()}
            >
              exact side
            </button>
            <p>from vertical · 0° is upright</p>
          </div>
        )}
        <div
          ref={box}
          className="lab-viewer"
          role="img"
          aria-label="Interactive 3D sloper preview. Drag to rotate; scroll to zoom."
        />
        <p className="lab-caption">
          <span>drag to rotate · scroll to zoom</span>
          <span>
            {view === "board"
              ? `mounted on a ${boardAngle}° board`
              : "flat back on the wall plane"}
          </span>
        </p>
      </section>
      <div className="lab-details">
        <section className="lab-card">
          <h3>side profile</h3>
          {preview ? (
            <Profile data={preview} />
          ) : (
            <p className="small-note">waiting for the first preview…</p>
          )}
        </section>
        <section className="lab-card">
          <h3>your model</h3>
          <dl className="lab-metrics">
            {preview && (
              <>
                <Metric
                  label="dimensions"
                  value={`${preview.dimensions.join(" × ")} mm`}
                />
                <Metric
                  label="estimated material"
                  value={`≈ ${preview.material_grams.join("–")} g`}
                />
                <Metric
                  label="mesh"
                  value={`${preview.triangles.toLocaleString()} triangles · closed`}
                />
                <Metric
                  label="screw holes"
                  value={String(preview.screws.length)}
                />
                <Metric
                  label="seat above wall"
                  value={`${preview.parameters.seat_depth} mm`}
                />
              </>
            )}
          </dl>
          <p className="small-note">
            25–40% infill · PETG at 1.27 g/cm³ · estimated 1.6 mm shell.
            Excludes supports and waste; check your slicer.
          </p>
          <p
            className={`lab-status ${status.error ? "error" : ""}`}
            role="status"
            aria-live="polite"
          >
            {status.text}
          </p>
          <button
            className="button button-dark"
            type="button"
            disabled={!design || exporting}
            onClick={exportStl}
          >
            {exporting ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Download size={16} />
            )}
            export STL
          </button>
        </section>
      </div>
    </div>
  );
}

function ControlRow({
  control,
  value,
  disabled,
  onChange,
}: {
  control: Control;
  value: number;
  disabled: boolean;
  onChange: (key: string, value: number) => void;
}) {
  const id = `sloper-${control.key}`;
  function handle(value: number) {
    if (
      Number.isFinite(value) &&
      (control.key !== "screw_count" || Number.isInteger(value))
    )
      onChange(control.key, value);
  }
  return (
    <div className="lab-control">
      <div className="lab-control-head">
        <label htmlFor={id}>{control.label}</label>
        <span className="lab-number">
          <input
            id={id}
            type="number"
            min={control.min}
            max={control.max}
            step={control.step}
            value={Number.isFinite(value) ? value : ""}
            disabled={disabled}
            aria-describedby={`${id}-hint`}
            onChange={(e) => handle(e.target.valueAsNumber)}
          />
          <span>{control.unit}</span>
        </span>
      </div>
      <input
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        disabled={disabled}
        aria-label={`${control.label} slider`}
        aria-describedby={`${id}-hint`}
        onChange={(e) => handle(e.target.valueAsNumber)}
      />
      <p className="lab-hint" id={`${id}-hint`}>
        {control.help}
      </p>
    </div>
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
