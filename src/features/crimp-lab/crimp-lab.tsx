"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, RotateCcw, Shuffle } from "lucide-react";
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
import { Viewer, type ViewName } from "./viewer";

const GROUPS = ["Grip", "Shape", "Mounting"] as const;
type Group = (typeof GROUPS)[number];
const VIEW_LABELS: Record<ViewName, string> = {
  "three-quarter": "3D",
  side: "Side",
  "angled-side": "Angled side",
  top: "Above",
  front: "Front",
};
const DEBOUNCE_MS = 180;
const CUSTOM = "Custom";

// Crimp Lab: sliders on the left, the generated hold on the right; on a
// phone the hold stays pinned above the sliders. Every change asks
// /api/crimp for a fresh preview; export asks for a finer STL.
export function CrimpLab() {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [parameters, setParameters] = useState<Parameters>({});
  const [preset, setPreset] = useState("");
  const [group, setGroup] = useState<Group>("Grip");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [design, setDesign] = useState<Design | null>(null);
  const [status, setStatus] = useState({
    text: "Loading generator…",
    error: false,
  });
  const [exporting, setExporting] = useState(false);
  const [view, setView] = useState<ViewName>("three-quarter");
  const viewerBox = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const fitNext = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSchema()
      .then((loaded) => {
        setSchema(loaded);
        setParameters({ ...loaded.defaults });
        setPreset(Object.keys(loaded.presets)[0] ?? CUSTOM);
      })
      .catch((error: Error) =>
        setStatus({
          text: `Could not start the generator: ${error.message}`,
          error: true,
        }),
      );
  }, []);

  useEffect(() => {
    const box = viewerBox.current;
    if (!box || viewer.current) return;
    const dark =
      document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    viewer.current = new Viewer(box, dark);
    return () => {
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, []);

  // Debounced preview after every change; superseded requests are dropped.
  useEffect(() => {
    if (!schema) return;
    const request = ++sequence.current;
    const timer = setTimeout(async () => {
      controller.current?.abort();
      controller.current = new AbortController();
      try {
        const response = await post(
          "preview",
          parameters,
          controller.current.signal,
        );
        const data = (await response.json()) as Preview;
        if (request !== sequence.current) return;
        viewer.current?.update(data, fitNext.current);
        fitNext.current = false;
        setPreview(data);
        setDesign(data.design);
        setStatus({
          text:
            data.lip_radius < Number(data.design.parameters.lip_radius)
              ? `Preview is current. The edge only has room for ${data.lip_radius} mm of lip rounding; deepen the edge or raise the body for more.`
              : "Preview is current. Export builds a finer version of this shape.",
          error: false,
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        if (request === sequence.current)
          setStatus({
            text: `${(error as Error).message} Showing the last valid model.`,
            error: true,
          });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [schema, parameters]);

  // Every edit goes through here so the stale design is cleared (export
  // disabled) and the status says a preview is on its way.
  const edit = useCallback(
    (next: (current: Parameters) => Parameters, presetName = CUSTOM) => {
      setPreset(presetName);
      setDesign(null);
      setStatus({ text: "Updating preview…", error: false });
      setParameters(next);
    },
    [],
  );
  const change = useCallback(
    (key: string, value: number | boolean) =>
      edit((current) => ({ ...current, [key]: value })),
    [edit],
  );

  function applyPreset(name: string) {
    if (!schema) return;
    fitNext.current = true;
    edit(() => ({ ...(schema.presets[name] ?? schema.defaults) }), name);
  }

  function reset() {
    if (!schema) return;
    fitNext.current = true;
    edit(() => ({ ...schema.defaults }), Object.keys(schema.presets)[0]);
  }

  function variation(seed: number) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 999999) return;
    edit((current) => ({
      ...current,
      seed,
      character: Math.max(1.4, Number(current.character)),
    }));
  }

  function newVariation() {
    variation(
      (Number(parameters.seed) +
        1 +
        (crypto.getRandomValues(new Uint32Array(1))[0] % 999999)) %
        1000000,
    );
  }

  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportStl() {
    if (!design) return;
    const snapshot = { ...design.parameters };
    const request = sequence.current;
    setExporting(true);
    setStatus({ text: "Building a fine STL…", error: false });
    try {
      const response = await post("stl", snapshot);
      download(
        await response.blob(),
        `crimp-${snapshot.edge_depth}mm-${snapshot.incut}deg.stl`,
      );
      if (request === sequence.current)
        setStatus({
          text: "STL downloaded. Save settings too if you want to revisit this design.",
          error: false,
        });
    } catch (error) {
      if (request === sequence.current)
        setStatus({ text: (error as Error).message, error: true });
    } finally {
      setExporting(false);
    }
  }

  function saveSettings() {
    if (!design) return;
    download(
      new Blob([JSON.stringify(design, null, 2)], { type: "application/json" }),
      `crimp-${design.parameters.edge_depth}mm.json`,
    );
  }

  async function loadSettings(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > DESIGN_FILE_LIMIT)
        throw new Error("Settings files must be smaller than 16 KB.");
      const saved = parseDesignFile(await file.text());
      const checked = await post("validate", saved);
      const data = (await checked.json()) as { parameters: Parameters };
      fitNext.current = true;
      edit(() => data.parameters);
    } catch (error) {
      setStatus({ text: (error as Error).message, error: true });
    }
  }

  const screws = Boolean(parameters.screws);
  const single = Number(parameters.screw_count) === 1;
  const disabledFor = (control: Control) =>
    control.group === "Mounting" &&
    (!screws ||
      (control.key === "screw_spacing" &&
        (Boolean(parameters.auto_spacing) || single)));

  return (
    <div className="lab">
      <aside className="lab-controls" aria-label="Crimp controls">
        <label className="lab-field">
          <span>Starting point</span>
          <select
            value={preset}
            disabled={!schema}
            onChange={(event) => applyPreset(event.target.value)}
          >
            {schema &&
              Object.keys(schema.presets).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            <option value={CUSTOM} disabled>
              {CUSTOM}
            </option>
          </select>
        </label>
        <div className="lab-tabs" role="tablist" aria-label="Design controls">
          {GROUPS.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={group === name}
              aria-controls={`lab-panel-${name}`}
              tabIndex={group === name ? 0 : -1}
              onClick={() => setGroup(name)}
              onKeyDown={(event) => {
                const index = GROUPS.indexOf(name);
                const next =
                  event.key === "ArrowRight"
                    ? GROUPS[(index + 1) % GROUPS.length]
                    : event.key === "ArrowLeft"
                      ? GROUPS[(index + GROUPS.length - 1) % GROUPS.length]
                      : event.key === "Home"
                        ? GROUPS[0]
                        : event.key === "End"
                          ? GROUPS[GROUPS.length - 1]
                          : null;
                if (!next) return;
                event.preventDefault();
                setGroup(next);
              }}
            >
              {name}
            </button>
          ))}
        </div>
        {schema &&
          GROUPS.map((name) => (
            <div
              key={name}
              id={`lab-panel-${name}`}
              role="tabpanel"
              hidden={group !== name}
              className="lab-panel"
            >
              {name === "Mounting" && (
                <>
                  <label className="lab-toggle">
                    <input
                      type="checkbox"
                      checked={screws}
                      onChange={(event) =>
                        change("screws", event.target.checked)
                      }
                    />
                    Screw-on mounting holes
                  </label>
                  <label className="lab-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(parameters.auto_spacing)}
                      disabled={!screws || single}
                      onChange={(event) =>
                        change("auto_spacing", event.target.checked)
                      }
                    />
                    Space screws to fit the body
                  </label>
                </>
              )}
              {schema.controls
                .filter((control) => control.group === name)
                .map((control) => (
                  <ControlRow
                    key={control.key}
                    control={control}
                    value={Number(parameters[control.key])}
                    disabled={disabledFor(control)}
                    onChange={(value) => change(control.key, value)}
                  />
                ))}
              {name === "Shape" && (
                <div className="lab-seed">
                  <label className="lab-field">
                    <span>Variation seed</span>
                    <div className="lab-seed-row">
                      <input
                        type="number"
                        min={0}
                        max={999999}
                        step={1}
                        value={Number(parameters.seed)}
                        onChange={(event) =>
                          variation(event.target.valueAsNumber)
                        }
                      />
                      <button
                        type="button"
                        className="button button-outline"
                        onClick={newVariation}
                      >
                        <Shuffle size={15} /> New variation
                      </button>
                    </div>
                  </label>
                  <p className="lab-hint">
                    Seeds create different body folds. Changing the seed starts
                    with visible character; dial it down for a subtler shape, or
                    reset for the clean default.
                  </p>
                </div>
              )}
            </div>
          ))}
        <div className="lab-settings-row">
          <button
            type="button"
            className="button button-outline"
            disabled={!design}
            onClick={saveSettings}
          >
            Save settings
          </button>
          <button
            type="button"
            className="button button-outline"
            disabled={!schema}
            onClick={() => fileInput.current?.click()}
          >
            Load settings
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label="Load a settings file"
            onChange={(event) => {
              loadSettings(event.target.files?.[0]);
              event.target.value = "";
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
          {(Object.keys(VIEW_LABELS) as ViewName[]).map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={view === name}
              onClick={() => {
                setView(name);
                viewer.current?.setView(name);
              }}
            >
              {VIEW_LABELS[name]}
            </button>
          ))}
          <button
            type="button"
            className="lab-toolbar-end"
            onClick={() => viewer.current?.fit()}
          >
            Fit view
          </button>
          <button type="button" onClick={reset} disabled={!schema}>
            <RotateCcw size={13} /> Reset
          </button>
        </div>
        <div
          ref={viewerBox}
          className="lab-viewer"
          role="img"
          aria-label="Interactive 3D crimp preview. Drag to rotate; scroll to zoom."
        />
        <p className="lab-caption">
          <span>Drag to rotate · scroll to zoom</span>
          <span>Flat back on the wall plane</span>
        </p>
      </section>
      <div className="lab-details">
        <section className="lab-card">
          <h3>Side profile</h3>
          {preview ? (
            <Profile data={preview} parameters={parameters} />
          ) : (
            <p className="small-note">Waiting for the first preview…</p>
          )}
        </section>
        <section className="lab-card">
          <h3>Your model</h3>
          <dl className="lab-metrics">
            {preview ? (
              <>
                <Metric
                  label="Dimensions"
                  value={`${preview.dimensions.join(" × ")} mm`}
                />
                <Metric
                  label="Solid volume"
                  value={`${preview.volume_cm3} cm³`}
                />
                <Metric
                  label="Mesh"
                  value={`${preview.triangles.toLocaleString()} triangles · closed`}
                />
                <Metric
                  label="Screw holes"
                  value={String(preview.screws.length)}
                />
                {preview.screw_spacing !== null && (
                  <Metric
                    label="Centre spacing"
                    value={`${preview.screw_spacing} mm across width`}
                  />
                )}
              </>
            ) : (
              <Metric label="Mesh" value="Preparing…" />
            )}
          </dl>
          <p
            className={`lab-status ${status.error ? "error" : ""}`}
            role="status"
            aria-live="polite"
          >
            {status.text}
          </p>
          <button
            type="button"
            className="button button-dark"
            disabled={!design || exporting}
            onClick={exportStl}
          >
            {exporting ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Download size={16} />
            )}{" "}
            Export STL
          </button>
          <p className="small-note">
            Millimetres · flat back · original geometry. Upload it like any
            other design when it has earned a place in the library.
          </p>
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
  onChange: (value: number) => void;
}) {
  const id = `lab-${control.key}`;
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
            onChange={(event) => {
              const next = event.target.valueAsNumber;
              if (Number.isFinite(next)) onChange(next);
            }}
          />
          <span>{control.unit}</span>
        </span>
      </div>
      <input
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={Number.isFinite(value) ? value : control.min}
        disabled={disabled}
        aria-label={`${control.label} slider`}
        aria-describedby={`${id}-hint`}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
      <p id={`${id}-hint`} className="lab-hint">
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
