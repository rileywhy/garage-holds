"use client";

import { mountingControlVisible } from "@/features/hold-lab/mounting";
import { trackEvent } from "@/features/analytics/events";
import {
  copyCurrentLink,
  currentSearch,
  linkSearch,
  readLink,
  replaceSearch,
} from "@/features/lab-link/lab-link";
import {
  deletePreset,
  isSavedValue,
  loadSavedPresets,
  savePreset,
  savedName,
  savedValue,
  type SavedPreset,
} from "@/features/lab-presets/saved-presets";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bookmark,
  Download,
  Link2,
  LoaderCircle,
  RotateCcw,
  Shuffle,
} from "lucide-react";
import {
  DESIGN_FILE_LIMIT,
  loadSchema,
  limitControl,
  parseDesignFile,
  post,
  type Control,
  type Design,
  type Parameters,
  type Preview,
  type Schema,
} from "./api";
import { Profile } from "./profile";
import {
  Viewer,
  isDarkTheme,
  type ViewName,
} from "@/features/model-viewer/viewer";
import {
  DEFAULT_BOARD_ANGLE,
  MAX_BOARD_ANGLE,
} from "@/features/model-viewer/board-preview";
import { previewGeometry } from "./preview-geometry";
import { GearLink } from "@/features/gear/gear-link";
import { GEAR } from "@/features/gear/gear";

const GROUPS = ["Grip", "Shape", "Mounting"] as const;
type Group = (typeof GROUPS)[number];
const VIEW_LABELS: Record<ViewName, string> = {
  "three-quarter": "3D",
  board: "Board preview",
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
  // Each edit bumps the revision, which is what triggers a preview; the
  // ref holds the latest parameters for that effect to read.
  const [revision, setRevision] = useState(0);
  const latest = useRef<Parameters>({});
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
  const [boardAngle, setBoardAngle] = useState(DEFAULT_BOARD_ANGLE);
  const viewerBox = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const fitNext = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  // Shown with the first preview when a shared link's settings were refused.
  const linkNote = useRef("");
  // Presets saved in this browser, and the small form that names a new one.
  const [saved, setSaved] = useState<SavedPreset[]>([]);
  const [naming, setNaming] = useState(false);
  const [presetName, setPresetName] = useState("");

  // Load the schema, then the settings a shared link asks for, so the first
  // preview is already the shared shape rather than the default.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadSchema();
        let start: Parameters = { ...loaded.defaults };
        let presetName = Object.keys(loaded.presets)[0] ?? CUSTOM;
        const link = readLink(currentSearch(), loaded.defaults, loaded.presets);
        if (link) {
          try {
            // The crimp has no text settings, so a typed link is a Parameters.
            const checked = await post(
              "validate",
              link.parameters as Parameters,
            );
            start = ((await checked.json()) as { parameters: Parameters })
              .parameters;
            presetName = link.preset ?? CUSTOM;
            trackEvent({ name: "lab_settings", lab: "crimp", action: "open" });
          } catch (error) {
            linkNote.current = ` The link's settings could not be applied (${(error as Error).message}), so this is the default crimp.`;
          }
        }
        if (cancelled) return;
        latest.current = start;
        setParameters(start);
        setSaved(loadSavedPresets("crimp"));
        setSchema(loaded);
        setPreset(presetName);
      } catch (error) {
        if (cancelled) return;
        trackEvent({ name: "lab_error", lab: "crimp", stage: "start" });
        setStatus({
          text: `Could not start the generator: ${(error as Error).message}`,
          error: true,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const box = viewerBox.current;
    if (!box || viewer.current) return;
    viewer.current = new Viewer(box, { dark: isDarkTheme() });
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
          latest.current,
          controller.current.signal,
        );
        const data = (await response.json()) as Preview;
        if (request !== sequence.current) return;
        viewer.current?.setGeometry(previewGeometry(data), fitNext.current);
        fitNext.current = false;
        setPreview(data);
        setDesign(data.design);
        // The generator may have changed a setting to make the shape work;
        // the sliders follow, and this preview already shows the result.
        const autoSpan: Parameters =
          Boolean(latest.current.auto_spacing) && data.screw_spacing !== null
            ? { screw_spacing: data.screw_spacing }
            : {};
        const autoSeat: Parameters = latest.current.auto_seat
          ? { seat_depth: data.seat_depth }
          : {};
        const fittedSeat: Parameters =
          typeof data.design.parameters.seat_depth === "number"
            ? { seat_depth: data.design.parameters.seat_depth }
            : {};
        const next: Parameters = {
          ...latest.current,
          ...data.adjusted,
          ...autoSpan,
          ...autoSeat,
          ...fittedSeat,
        };
        // The sliders follow every fitted value, but the menu only drops
        // to Custom when something other than an automatic value moved:
        // the fitted span and seat are results of the preset, not edits.
        const derived = new Set<string>([
          ...(latest.current.auto_spacing ? ["screw_spacing"] : []),
          ...(latest.current.auto_seat ? ["seat_depth"] : []),
        ]);
        const moved = Object.keys(next).filter(
          (key) => next[key] !== latest.current[key],
        );
        if (moved.length) {
          latest.current = next;
          setParameters(latest.current);
          if (moved.some((key) => !derived.has(key))) setPreset(CUSTOM);
        }
        const notes = [
          data.adjusted.body_height !== undefined
            ? `Body height raised to ${data.adjusted.body_height} mm so the screws fit.`
            : "",
          data.lip_radius < Number(data.design.parameters.lip_radius)
            ? `The edge only has room for ${data.lip_radius} mm of lip rounding; deepen the edge or raise the body for more.`
            : "",
        ].filter(Boolean);
        setStatus({
          text:
            (notes.length
              ? `Preview is current. ${notes.join(" ")}`
              : "Preview is current. Export builds a finer version of this shape.") +
            linkNote.current,
          error: false,
        });
        linkNote.current = "";
        // The address bar always holds the shape on screen, ready to share.
        replaceSearch(
          linkSearch(latest.current, schema.defaults, schema.presets),
        );
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        if (request === sequence.current) {
          trackEvent({ name: "lab_error", lab: "crimp", stage: "preview" });
          setStatus({
            text: `${(error as Error).message} Showing the last valid model.`,
            error: true,
          });
        }
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [schema, revision]);

  // Every edit goes through here so the stale design is cleared (export
  // disabled) and the status says a preview is on its way.
  const edit = useCallback(
    (next: (current: Parameters) => Parameters, presetName = CUSTOM) => {
      setPreset(presetName);
      setDesign(null);
      setStatus({ text: "Updating preview…", error: false });
      latest.current = next(latest.current);
      setParameters(latest.current);
      setRevision((current) => current + 1);
    },
    [],
  );
  const change = useCallback(
    (key: string, value: number | boolean) =>
      edit((current) => ({
        ...current,
        [key]: value,
        ...(key === "screw_spacing" ? { auto_spacing: false } : {}),
        ...(key === "seat_depth" ? { auto_seat: false } : {}),
      })),
    [edit],
  );

  function applyPreset(name: string) {
    if (!schema) return;
    if (isSavedValue(name)) {
      applySavedPreset(savedName(name));
      return;
    }
    fitNext.current = true;
    edit(() => ({ ...(schema.presets[name] ?? schema.defaults) }), name);
  }

  // A saved preset goes through the generator's validation first, so one
  // saved before a control changed still opens cleanly.
  async function applySavedPreset(name: string) {
    const found = saved.find((p) => p.name === name);
    if (!schema || !found) return;
    try {
      const checked = await post("validate", {
        ...schema.defaults,
        ...(found.parameters as Parameters),
      });
      const data = (await checked.json()) as { parameters: Parameters };
      fitNext.current = true;
      edit(() => data.parameters, savedValue(name));
    } catch (error) {
      setStatus({ text: (error as Error).message, error: true });
    }
  }

  function startNaming() {
    setPresetName(isSavedValue(preset) ? savedName(preset) : "");
    setNaming(true);
  }

  function saveAsPreset(event: React.FormEvent) {
    event.preventDefault();
    try {
      const list = savePreset("crimp", presetName, latest.current);
      const name = list[0].name;
      setSaved(list);
      setPreset(savedValue(name));
      setNaming(false);
      trackEvent({ name: "lab_settings", lab: "crimp", action: "preset" });
      setStatus({
        text: `Saved as “${name}”. Presets live in this browser; Copy link or Save settings takes a shape elsewhere.`,
        error: false,
      });
    } catch (error) {
      setStatus({ text: (error as Error).message, error: true });
    }
  }

  function removePreset() {
    if (!isSavedValue(preset)) return;
    const name = savedName(preset);
    setSaved(deletePreset("crimp", name));
    setPreset(CUSTOM);
    setStatus({ text: `Deleted the preset “${name}”.`, error: false });
  }

  function reset() {
    if (!schema) return;
    fitNext.current = true;
    setBoardAngle(DEFAULT_BOARD_ANGLE);
    viewer.current?.setBoardAngle(DEFAULT_BOARD_ANGLE);
    edit(() => ({ ...schema.defaults }), Object.keys(schema.presets)[0]);
  }

  function changeBoardAngle(angle: number) {
    if (!Number.isFinite(angle) || angle < 0 || angle > MAX_BOARD_ANGLE) return;
    setBoardAngle(angle);
    viewer.current?.setBoardAngle(angle);
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
      trackEvent({ name: "export_stl", lab: "crimp" });
      if (request === sequence.current)
        setStatus({
          text: "STL downloaded. Save settings too if you want to revisit this design.",
          error: false,
        });
    } catch (error) {
      if (request === sequence.current) {
        trackEvent({ name: "lab_error", lab: "crimp", stage: "export" });
        setStatus({ text: (error as Error).message, error: true });
      }
    } finally {
      setExporting(false);
    }
  }

  async function copyLink() {
    if (!design || !schema) return;
    replaceSearch(linkSearch(latest.current, schema.defaults, schema.presets));
    const copied = await copyCurrentLink();
    if (copied)
      trackEvent({ name: "lab_settings", lab: "crimp", action: "link" });
    setStatus({
      text: copied
        ? "Link copied. Anyone who opens it gets this exact shape."
        : "Could not reach the clipboard. Copy the address from the address bar instead.",
      error: !copied,
    });
  }

  function saveSettings() {
    if (!design) return;
    download(
      new Blob([JSON.stringify(design, null, 2)], { type: "application/json" }),
      `crimp-${design.parameters.edge_depth}mm.json`,
    );
    trackEvent({ name: "lab_settings", lab: "crimp", action: "save" });
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
      trackEvent({ name: "lab_settings", lab: "crimp", action: "load" });
    } catch (error) {
      setStatus({ text: (error as Error).message, error: true });
    }
  }

  const screws = Boolean(parameters.screws);
  const disabledFor = (control: Control) =>
    control.group === "Mounting" && !screws;

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
            {saved.length > 0 && (
              <optgroup label="My presets">
                {saved.map((p) => (
                  <option key={p.name} value={savedValue(p.name)}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
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
                    Mounting holes
                  </label>
                  <label className="lab-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(parameters.bolt_mount)}
                      disabled={!screws}
                      onChange={(event) =>
                        change("bolt_mount", event.target.checked)
                      }
                    />
                    Bolt + one screw
                  </label>
                  {Boolean(parameters.bolt_mount) && (
                    <p className="lab-hint">
                      One flat-bottom M10 bolt recess and one countersunk
                      anti-rotation screw. Check the dimensions against your
                      hardware.
                    </p>
                  )}
                </>
              )}
              {schema.controls
                .filter(
                  (control) =>
                    control.group === name &&
                    mountingControlVisible(control.key, parameters),
                )
                .map((control) => (
                  <ControlRow
                    key={control.key}
                    control={limitControl(control, preview)}
                    value={Number(parameters[control.key])}
                    disabled={disabledFor(control)}
                    onChange={(value) => change(control.key, value)}
                    onReset={() => {
                      if (control.key === "screw_spacing")
                        change("auto_spacing", true);
                      else if (control.key === "seat_depth")
                        edit((current) => ({
                          ...current,
                          auto_seat: true,
                          seat_depth: Number(schema.defaults.seat_depth),
                        }));
                      else
                        change(
                          control.key,
                          Number(schema.defaults[control.key]),
                        );
                    }}
                    autoSpacing={
                      control.key === "screw_spacing" && !parameters.bolt_mount
                    }
                    autoSpacingChecked={Boolean(parameters.auto_spacing)}
                    onAutoSpacing={(checked) =>
                      edit((current) => ({
                        ...current,
                        auto_spacing: checked,
                        ...(checked && preview?.screw_spacing != null
                          ? { screw_spacing: preview.screw_spacing }
                          : {}),
                      }))
                    }
                    autoSeat={control.key === "seat_depth"}
                    autoSeatChecked={Boolean(parameters.auto_seat)}
                    onAutoSeat={(checked) => {
                      const seat = preview?.seat_depth;
                      edit((current) => ({
                        ...current,
                        auto_seat: checked,
                        ...(checked
                          ? { seat_depth: seat ?? current.seat_depth }
                          : seat === undefined
                            ? {}
                            : { seat_depth: seat }),
                      }));
                    }}
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
          <button
            type="button"
            className="button button-outline"
            disabled={!design}
            onClick={copyLink}
            title="Copy a link that opens this exact shape"
          >
            <Link2 size={15} aria-hidden="true" /> Copy link
          </button>
          <button
            type="button"
            className="button button-outline"
            disabled={!design || naming}
            onClick={startNaming}
            title="Keep this shape in the starting-point menu, in this browser"
          >
            <Bookmark size={15} aria-hidden="true" /> Save as preset
          </button>
          {isSavedValue(preset) && !naming && (
            <button
              type="button"
              className="button button-outline"
              onClick={removePreset}
            >
              Delete preset
            </button>
          )}
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
        {naming && (
          <form className="lab-preset-form" onSubmit={saveAsPreset}>
            <input
              type="text"
              value={presetName}
              maxLength={40}
              autoFocus
              aria-label="Preset name"
              placeholder="Name this preset"
              onChange={(event) => setPresetName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setNaming(false);
              }}
            />
            <button type="submit" className="button button-dark">
              Save
            </button>
            <button
              type="button"
              className="button button-outline"
              onClick={() => setNaming(false)}
            >
              Cancel
            </button>
          </form>
        )}
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
        {view === "board" && (
          <div className="lab-board-controls">
            <label htmlFor="board-angle">Board angle</label>
            <input
              id="board-angle"
              type="number"
              min={0}
              max={MAX_BOARD_ANGLE}
              step={1}
              value={boardAngle}
              onChange={(event) => changeBoardAngle(event.target.valueAsNumber)}
              aria-describedby="board-angle-hint"
            />
            <span>°</span>
            <input
              type="range"
              min={0}
              max={MAX_BOARD_ANGLE}
              step={1}
              value={boardAngle}
              aria-label="Board angle slider"
              aria-describedby="board-angle-hint"
              onChange={(event) => changeBoardAngle(event.target.valueAsNumber)}
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
              Exact side
            </button>
            <p id="board-angle-hint">From vertical · 0° is upright</p>
          </div>
        )}
        <div
          ref={viewerBox}
          className="lab-viewer"
          role="img"
          aria-label="Interactive 3D crimp preview. Drag to rotate; scroll to zoom."
        />
        <p className="lab-caption">
          <span>Drag to rotate · scroll to zoom</span>
          <span>
            {view === "board"
              ? `Mounted on a ${boardAngle}° board · side view`
              : "Flat back on the wall plane"}
          </span>
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
                  label="Estimated material"
                  value={`≈ ${preview.material_grams.join("–")} g`}
                />
                <Metric
                  label="Mesh"
                  value={`${preview.triangles.toLocaleString()} triangles · closed`}
                />
                {preview.screws.length > 0 && (
                  <Metric
                    label="Screw seat"
                    value={`${preview.seat_depth} mm above the wall`}
                  />
                )}
                <Metric
                  label="Screw holes"
                  value={String(preview.screws.length)}
                />
                {(preview.bolts?.length ?? 0) > 0 && (
                  <Metric
                    label="Bolt holes"
                    value={String(preview.bolts?.length)}
                  />
                )}
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
          {preview && (
            <p className="small-note">
              25–40% infill · <GearLink item={GEAR.petg}>PETG</GearLink> at 1.27
              g/cm³ · estimated 1.6 mm shell. Rough estimate; excludes supports
              and waste. Check your slicer for the final weight.{" "}
              <Link href="/how-to-3d-print-climbing-holds#settings">
                How we print holds.
              </Link>
            </p>
          )}
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
  onReset,
  autoSpacing,
  autoSpacingChecked,
  onAutoSpacing,
  autoSeat,
  autoSeatChecked,
  onAutoSeat,
}: {
  control: Control;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
  onReset: () => void;
  autoSpacing: boolean;
  autoSpacingChecked: boolean;
  onAutoSpacing: (checked: boolean) => void;
  autoSeat: boolean;
  autoSeatChecked: boolean;
  onAutoSeat: (checked: boolean) => void;
}) {
  const id = `lab-${control.key}`;
  const sliderDisabled = disabled;
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
            disabled={sliderDisabled}
            aria-describedby={`${id}-hint`}
            onChange={(event) => {
              const next = event.target.valueAsNumber;
              if (Number.isFinite(next))
                onChange(Math.min(control.max, Math.max(control.min, next)));
            }}
          />
          <span>{control.unit}</span>
          <button
            type="button"
            className="lab-control-reset"
            disabled={disabled}
            aria-label={`Reset ${control.label}`}
            title={`Reset ${control.label}`}
            onClick={onReset}
          >
            <RotateCcw size={14} aria-hidden="true" />
          </button>
        </span>
      </div>
      <div className="lab-slider-with-auto">
        <input
          type="range"
          min={control.min}
          max={control.max}
          step={control.step}
          value={Number.isFinite(value) ? value : control.min}
          disabled={sliderDisabled}
          aria-label={`${control.label} slider`}
          aria-describedby={`${id}-hint`}
          onChange={(event) =>
            onChange(
              Math.min(
                control.max,
                Math.max(control.min, event.target.valueAsNumber),
              ),
            )
          }
          onDoubleClick={onReset}
        />
        {(autoSpacing || autoSeat) && (
          <label className="lab-toggle">
            <input
              type="checkbox"
              checked={autoSpacing ? autoSpacingChecked : autoSeatChecked}
              onChange={(event) =>
                autoSpacing
                  ? onAutoSpacing(event.target.checked)
                  : onAutoSeat(event.target.checked)
              }
            />
            auto
          </label>
        )}
      </div>
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
