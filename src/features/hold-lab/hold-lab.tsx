"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import {
  Bookmark,
  Download,
  Link2,
  LoaderCircle,
  RotateCcw,
  Shuffle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  VIEW_LABELS,
  Viewer,
  isDarkTheme,
  type ViewName,
} from "@/features/model-viewer/viewer";
import {
  DEFAULT_BOARD_ANGLE,
  MAX_BOARD_ANGLE,
} from "@/features/model-viewer/board-preview";
import { previewGeometry } from "@/features/labs/preview-geometry";
import { trackEvent } from "@/features/analytics/events";
import {
  copyCurrentLink,
  currentSearch,
  linkSearch,
  readLink,
  replaceSearch,
} from "@/features/lab-link/lab-link";
import {
  defaultPresetName,
  isSavedValue,
  savedId,
  savedValue,
  uniqueName,
  type LabPreset,
} from "@/features/lab-presets/saved-presets";
import { presetStore, savedWhere } from "@/features/lab-presets/preset-store";
import {
  LAB_COPY,
  PREVIEW_DEBOUNCE_MS,
  labFilename,
} from "@/features/labs/conventions";
import { errorReason } from "@/features/labs/lab-request";
import { GearLink } from "@/features/gear/gear-link";
import { GEAR } from "@/features/gear/gear";
import { SafetyNote } from "@/features/legal/safety-note";
import {
  DESIGN_FILE_LIMIT,
  KIND_LABELS,
  limitControl,
  loadSchema,
  parseDesignFile,
  post,
  validate,
  type Control,
  type Design,
  type Kind,
  type Parameters,
  type Preview,
  type Schema,
} from "./api";
import { LAB_KINDS, followPreview, modelMetrics } from "./kinds";
import { mountingControlVisible } from "./mounting";
import { Profile } from "./profile";

const GROUPS = ["Grip", "Shape", "Mounting"] as const;
type Group = (typeof GROUPS)[number];
const CUSTOM = "Custom";

// What the status line says, and the step to try again when it failed.
interface Status {
  text: string;
  error: boolean;
  retry?: () => void;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reportError(
  lab: Kind,
  stage: "start" | "preview" | "export",
  error: unknown,
) {
  trackEvent({ name: "lab_error", lab, stage, reason: errorReason(error) });
}

// The one lab behind the parametric labs, Crimp to Pinch: sliders on the
// left, the generated hold on the right; on a phone the hold stays pinned
// above the sliders. Every change asks /api/<kind> for a fresh preview and
// export asks for a finer STL. What differs between them is in kinds.ts.
export function HoldLab({
  kind,
  account = false,
}: {
  kind: Kind;
  account?: boolean;
}) {
  const lab = LAB_KINDS[kind];
  const path = `/make/${kind}`;
  // Presets go to the account when signed in, to this browser otherwise.
  const store = useMemo(() => presetStore(kind, account), [kind, account]);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [parameters, setParameters] = useState<Parameters>({});
  // Each edit bumps the revision, which is what triggers a preview; the ref
  // holds the latest settings for that effect to read.
  const latest = useRef<Parameters>({});
  const [revision, setRevision] = useState(0);
  // Bumped by Retry after the generator failed to start.
  const [attempt, setAttempt] = useState(0);
  const [preset, setPreset] = useState("");
  const [group, setGroup] = useState<Group>("Grip");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [design, setDesign] = useState<Design | null>(null);
  const [status, setStatus] = useState<Status>({
    text: LAB_COPY.starting,
    error: false,
  });
  const [exporting, setExporting] = useState(false);
  const [view, setView] = useState<ViewName>("three-quarter");
  const [boardAngle, setBoardAngle] = useState(DEFAULT_BOARD_ANGLE);
  const [viewerFailed, setViewerFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const fitNext = useRef(true);
  const shown = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Shown with the first preview when a shared link's settings were refused.
  const linkNote = useRef("");
  // The settings the person started from: the preset they picked, a saved
  // preset, a loaded file or a shared link. A slider's reset returns there.
  const origin = useRef<Parameters>({});
  // Presets the person saved, and the small form that renames one.
  const [saved, setSaved] = useState<LabPreset[]>([]);
  const [saving, setSaving] = useState(false);
  const [naming, setNaming] = useState(false);
  const [presetName, setPresetName] = useState("");

  // Load the schema, then the settings a shared link asks for, so the first
  // preview is already the shared shape rather than the default.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadSchema(kind);
        let start: Parameters = { ...loaded.defaults };
        let name = Object.keys(loaded.presets)[0] ?? CUSTOM;
        const link = readLink(currentSearch(), loaded.defaults, loaded.presets);
        if (link) {
          try {
            start = await validate(kind, link.parameters);
            name = link.preset ?? CUSTOM;
            trackEvent({ name: "lab_settings", lab: kind, action: "open" });
          } catch (error) {
            // A timeout, lost connection or server failure says nothing
            // about the link: it goes to the outer catch, which keeps the
            // address and offers Retry. Only a refusal by the generator
            // means the settings themselves are the problem.
            if (errorReason(error) !== "rejected") throw error;
            linkNote.current = LAB_COPY.linkRefused((error as Error).message);
          }
        }
        if (cancelled) return;
        latest.current = start;
        origin.current = { ...start };
        setParameters(start);
        void store
          .list()
          .then((list) => {
            if (!cancelled) setSaved(list);
          })
          .catch(() => {});
        setNaming(false);
        setPreset(name);
        setSchema(loaded);
      } catch (error) {
        if (cancelled) return;
        reportError(kind, "start", error);
        setStatus({
          text: (error as Error).message,
          error: true,
          retry: () => {
            setStatus({ text: LAB_COPY.starting, error: false });
            setAttempt((n) => n + 1);
          },
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, attempt, store]);

  useEffect(() => {
    if (!box.current) return;
    try {
      viewer.current = new Viewer(box.current, {
        dark: isDarkTheme(),
        color: lab.color,
      });
    } catch {
      // No WebGL: the sliders and export still work without a picture.
      queueMicrotask(() => setViewerFailed(true));
      trackEvent({
        name: "lab_error",
        lab: kind,
        stage: "start",
        reason: "webgl",
      });
    }
    return () => {
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, [kind, lab.color]);

  const retryPreview = useCallback(() => {
    setStatus({ text: LAB_COPY.updating, error: false });
    setRevision((r) => r + 1);
  }, []);

  // Debounced preview after every change; superseded requests are dropped.
  useEffect(() => {
    if (!schema) return;
    const request = ++sequence.current;
    const retire = () => void ++sequence.current;
    const timer = setTimeout(async () => {
      controller.current?.abort();
      controller.current = new AbortController();
      try {
        const response = await post(
          kind,
          "preview",
          latest.current,
          controller.current.signal,
        );
        const data = (await response.json()) as Preview;
        if (request !== sequence.current) return;
        viewer.current?.setGeometry(
          previewGeometry(data, lab.separateBack),
          fitNext.current,
        );
        fitNext.current = false;
        shown.current = true;
        const outcome = followPreview(
          kind,
          latest.current,
          data,
          schema.controls,
        );
        latest.current = outcome.parameters;
        setParameters(latest.current);
        if (outcome.custom) setPreset(CUSTOM);
        setPreview(data);
        setDesign(data.design);
        setStatus({ text: outcome.text + linkNote.current, error: false });
        linkNote.current = "";
        // The address bar always holds the shape on screen, ready to share.
        replaceSearch(
          linkSearch(latest.current, schema.defaults, schema.presets),
          path,
        );
      } catch (error) {
        if (
          (error as Error).name === "AbortError" ||
          request !== sequence.current
        )
          return;
        reportError(kind, "preview", error);
        setStatus({
          text:
            (error as Error).message +
            (shown.current ? LAB_COPY.lastValid : ""),
          error: true,
          retry: retryPreview,
        });
      }
    }, PREVIEW_DEBOUNCE_MS);
    // Leaving the page, or a newer edit: a request still in flight is
    // cancelled and its number retired, so a late answer changes nothing.
    return () => {
      clearTimeout(timer);
      controller.current?.abort();
      retire();
    };
  }, [schema, revision, kind, path, lab.separateBack, retryPreview]);

  // Every edit goes through here so the stale design is cleared (export
  // disabled), the status says a preview is on its way, and the preview
  // effect runs again.
  const edit = useCallback(
    (next: (p: Parameters) => Parameters, name = CUSTOM, fit = false) => {
      latest.current = next(latest.current);
      setParameters(latest.current);
      setPreset(name);
      setDesign(null);
      setStatus({ text: LAB_COPY.updating, error: false });
      fitNext.current ||= fit;
      setRevision((r) => r + 1);
    },
    [],
  );
  const change = useCallback(
    (key: string, value: number | boolean) =>
      edit((p) => ({
        ...p,
        [key]: value,
        // Moving a fitted value by hand turns its automatic fit off; the
        // toggle beside the slider is the way back.
        ...(key === "screw_spacing" ? { auto_spacing: false } : {}),
        ...(key === "seat_depth" ? { auto_seat: false } : {}),
        ...(key === "screw_count" && "auto_screw_count" in p
          ? { auto_screw_count: false }
          : {}),
      })),
    [edit],
  );

  function showError(error: unknown) {
    setStatus({ text: (error as Error).message, error: true });
  }
  // A new starting point: a preset, a saved preset or a loaded file. Each
  // slider's reset returns here, and the view refits to the new shape.
  function startFrom(settings: Parameters, name: string) {
    origin.current = { ...settings };
    edit(() => ({ ...settings }), name, true);
  }
  function changeBoardAngle(angle: number) {
    if (!Number.isFinite(angle) || angle < 0 || angle > MAX_BOARD_ANGLE) return;
    setBoardAngle(angle);
    viewer.current?.setBoardAngle(angle);
  }
  function reset() {
    if (!schema) return;
    changeBoardAngle(DEFAULT_BOARD_ANGLE);
    startFrom(schema.defaults, Object.keys(schema.presets)[0]);
  }
  function variation(seed: number) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 999999) return;
    edit((p) => ({
      ...p,
      seed,
      character: Math.max(lab.character, Number(p.character)),
    }));
  }
  function newVariation() {
    variation(
      (Number(latest.current.seed) +
        1 +
        (crypto.getRandomValues(new Uint32Array(1))[0] % 999999)) %
        1000000,
    );
  }
  async function loadSettings(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > DESIGN_FILE_LIMIT)
        throw new Error("Settings files must be smaller than 16 KB.");
      const saved = parseDesignFile(await file.text(), kind);
      startFrom(await validate(kind, saved), CUSTOM);
      trackEvent({ name: "lab_settings", lab: kind, action: "load" });
    } catch (error) {
      showError(error);
    }
  }
  function applyPreset(name: string) {
    if (!schema) return;
    if (isSavedValue(name)) void applySavedPreset(savedId(name));
    else startFrom(schema.presets[name] ?? schema.defaults, name);
  }
  async function applySavedPreset(id: string) {
    const found = saved.find((p) => p.id === id);
    if (!schema || !found) return;
    try {
      const link = readLink(found.search, schema.defaults, schema.presets);
      const settings = await validate(
        kind,
        link?.parameters ?? schema.defaults,
      );
      startFrom(settings, savedValue(id));
    } catch (error) {
      showError(error);
    }
  }
  function startRenaming() {
    setPresetName(saved.find((p) => p.id === savedId(preset))?.name ?? "");
    setNaming(true);
  }
  // One click: the shape on screen, named after its settings. Rename after.
  async function saveAsPreset() {
    if (!schema || !design) return;
    setSaving(true);
    try {
      const name = uniqueName(
        defaultPresetName(kind, latest.current),
        saved.map((p) => p.name),
      );
      // The full settings, not a preset name: a renamed generator preset
      // must not break a saved one.
      const list = await store.save(
        name,
        linkSearch(latest.current, schema.defaults),
      );
      const made = list.find((p) => p.name === name) ?? list[0];
      setSaved(list);
      if (made) setPreset(savedValue(made.id));
      trackEvent({ name: "lab_settings", lab: kind, action: "preset" });
      setStatus({ text: savedWhere(account, name), error: false });
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  }
  async function renameSavedPreset(event: FormEvent) {
    event.preventDefault();
    const wanted = presetName.trim().replace(/\s+/g, " ").toLowerCase();
    try {
      const list = await store.rename(savedId(preset), presetName);
      const renamed = list.find((p) => p.name.toLowerCase() === wanted);
      setSaved(list);
      if (renamed) setPreset(savedValue(renamed.id));
      setNaming(false);
      setStatus({
        text: `Renamed to “${renamed?.name ?? presetName}”.`,
        error: false,
      });
    } catch (error) {
      showError(error);
    }
  }
  async function removePreset() {
    if (!isSavedValue(preset)) return;
    const id = savedId(preset);
    const name = saved.find((p) => p.id === id)?.name ?? "";
    try {
      setSaved(await store.remove(id));
      setPreset(CUSTOM);
      setStatus({ text: LAB_COPY.presetDeleted(name), error: false });
    } catch (error) {
      showError(error);
    }
  }
  async function copyLink() {
    if (!design || !schema) return;
    replaceSearch(
      linkSearch(latest.current, schema.defaults, schema.presets),
      path,
    );
    const copied = await copyCurrentLink();
    if (copied) trackEvent({ name: "lab_settings", lab: kind, action: "link" });
    setStatus({
      text: copied ? LAB_COPY.linkCopied : LAB_COPY.clipboard,
      error: !copied,
    });
  }
  async function exportStl() {
    if (!design || !preview) return;
    const snapshot = { ...design.parameters };
    const request = sequence.current;
    setExporting(true);
    setStatus({ text: LAB_COPY.building, error: false });
    try {
      const response = await post(kind, "stl", snapshot);
      download(
        await response.blob(),
        labFilename(kind, preview.dimensions, "stl"),
      );
      trackEvent({ name: "export_stl", lab: kind });
      if (request === sequence.current)
        setStatus({ text: LAB_COPY.exported, error: false });
    } catch (error) {
      if (request === sequence.current) {
        reportError(kind, "export", error);
        setStatus({
          text: (error as Error).message,
          error: true,
          retry: () => void exportStl(),
        });
      }
    } finally {
      setExporting(false);
    }
  }
  function saveSettings() {
    if (!design || !preview) return;
    download(
      new Blob([JSON.stringify(design, null, 2)], { type: "application/json" }),
      labFilename(kind, preview.dimensions, "json"),
    );
    trackEvent({ name: "lab_settings", lab: kind, action: "save" });
  }

  // The automatic fits the generator offers, as a toggle beside the span
  // and seat sliders. Moving a slider turns its fit off; the toggle is the
  // way back without resetting the rest of the shape.
  function autoToggle(key: string) {
    if (
      key === "screw_spacing" &&
      "auto_spacing" in parameters &&
      !parameters.bolt_mount
    )
      return {
        checked: Boolean(parameters.auto_spacing),
        onChange: (checked: boolean) =>
          edit((p) => ({ ...p, auto_spacing: checked })),
      };
    if (key === "seat_depth" && "auto_seat" in parameters)
      return {
        checked: Boolean(parameters.auto_seat),
        onChange: (checked: boolean) =>
          edit((p) => ({ ...p, auto_seat: checked })),
      };
    return undefined;
  }
  // Back to the starting point the person chose (preset, saved preset,
  // loaded file or link), not the generator's base values. A fitted value
  // goes back to being fitted when that is how it started.
  function resetControl(key: string) {
    if (!schema) return;
    const start = origin.current;
    if (key === "screw_spacing")
      edit((p) => ({
        ...p,
        ...(start.auto_spacing === false &&
        typeof start.screw_spacing === "number"
          ? { auto_spacing: false, screw_spacing: start.screw_spacing }
          : { auto_spacing: true }),
      }));
    else if (key === "seat_depth")
      edit((p) => ({
        ...p,
        auto_seat: start.auto_seat !== false,
        seat_depth: Number(start.seat_depth ?? schema.defaults.seat_depth),
      }));
    else change(key, Number(start[key] ?? schema.defaults[key]));
  }

  const screws = Boolean(parameters.screws);
  return (
    <div className="lab">
      <aside
        className="lab-controls"
        aria-label={`${KIND_LABELS[kind]} controls`}
      >
        <label className="lab-field">
          <span>Starting point</span>
          <select
            value={preset}
            disabled={!schema}
            onChange={(event) => applyPreset(event.target.value)}
          >
            {schema &&
              Object.keys(schema.presets).map((name) => (
                <option key={name}>{name}</option>
              ))}
            {saved.length > 0 && (
              <optgroup label="My presets">
                {saved.map((p) => (
                  <option key={p.id} value={savedValue(p.id)}>
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
          {GROUPS.map((name, index) => (
            <button
              type="button"
              key={name}
              role="tab"
              id={`${kind}-tab-${name}`}
              aria-selected={group === name}
              aria-controls={`${kind}-panel-${name}`}
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
                const last = GROUPS.length - 1;
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? last
                      : (index + (event.key === "ArrowRight" ? 1 : last)) %
                        GROUPS.length;
                setGroup(GROUPS[next]);
                document.getElementById(`${kind}-tab-${GROUPS[next]}`)?.focus();
              }}
            >
              {name}
            </button>
          ))}
        </div>
        {!schema && !status.error && <Skeleton />}
        {schema &&
          GROUPS.map((name) => (
            <div
              key={name}
              className="lab-panel"
              role="tabpanel"
              id={`${kind}-panel-${name}`}
              aria-labelledby={`${kind}-tab-${name}`}
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
                    Mounting holes
                  </label>
                  <label className="lab-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(parameters.bolt_mount)}
                      disabled={!screws}
                      onChange={(e) => change("bolt_mount", e.target.checked)}
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
                  {schema.autoScrewCount && !parameters.bolt_mount && (
                    <label className="lab-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(parameters.auto_screw_count)}
                        disabled={!screws}
                        onChange={(e) =>
                          change("auto_screw_count", e.target.checked)
                        }
                      />
                      Choose the screw count from the size
                    </label>
                  )}
                </>
              )}
              {name === "Shape" && schema.shapes && (
                <label className="lab-field">
                  <span>{schema.shapeLabel ?? "Body shape"}</span>
                  <select
                    value={String(parameters.shape)}
                    onChange={(e) =>
                      edit(
                        (p) => ({ ...p, shape: e.target.value }),
                        CUSTOM,
                        true,
                      )
                    }
                  >
                    {Object.entries(schema.shapes).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {schema.toggles
                ?.filter((toggle) => toggle.group === name)
                .map((toggle) => (
                  <div key={toggle.key}>
                    <label className="lab-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(parameters[toggle.key])}
                        onChange={(e) => change(toggle.key, e.target.checked)}
                      />
                      {toggle.label}
                    </label>
                    {toggle.help && Boolean(parameters[toggle.key]) && (
                      <p className="lab-hint">{toggle.help}</p>
                    )}
                  </div>
                ))}
              {schema.controls
                .filter(
                  (c) =>
                    c.group === name &&
                    mountingControlVisible(c.key, parameters) &&
                    (!c.shapes ||
                      c.shapes.includes(String(parameters.shape))) &&
                    !(c.hidden_by && parameters[c.hidden_by] === true),
                )
                .map((control) => (
                  <ControlRow
                    key={control.key}
                    control={limitControl(control, preview)}
                    value={Number(parameters[control.key])}
                    disabled={name === "Mounting" && !screws}
                    clamp={lab.clampTyped}
                    onChange={change}
                    onReset={() => resetControl(control.key)}
                    auto={autoToggle(control.key)}
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
                        onChange={(e) => variation(e.target.valueAsNumber)}
                      />
                      <button
                        className="button button-outline"
                        type="button"
                        onClick={newVariation}
                      >
                        <Shuffle size={15} />
                        New variation
                      </button>
                    </div>
                  </label>
                  <p className="lab-hint">{lab.seedHint}</p>
                </div>
              )}
            </div>
          ))}
        <div className="lab-settings-row">
          <button
            className="button button-outline"
            type="button"
            disabled={!design}
            onClick={saveSettings}
          >
            Save settings
          </button>
          <button
            className="button button-outline"
            type="button"
            disabled={!schema}
            onClick={() => fileInput.current?.click()}
          >
            Load settings
          </button>
          <button
            className="button button-outline"
            type="button"
            disabled={!design}
            onClick={copyLink}
            title="Copy a link that opens this exact shape"
          >
            <Link2 size={15} aria-hidden="true" /> Copy link
          </button>
          <button
            className="button button-outline"
            type="button"
            disabled={!design || saving}
            onClick={saveAsPreset}
            title={
              account
                ? "Keep this shape in your starting-point menu and under Saved"
                : "Keep this shape in the starting-point menu, in this browser"
            }
          >
            <Bookmark size={15} aria-hidden="true" /> Save as preset
          </button>
          {isSavedValue(preset) && !naming && (
            <>
              <button
                className="button button-outline"
                type="button"
                onClick={startRenaming}
              >
                Rename
              </button>
              <button
                className="button button-outline"
                type="button"
                onClick={removePreset}
              >
                Delete preset
              </button>
            </>
          )}
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
        {naming && (
          <form className="lab-preset-form" onSubmit={renameSavedPreset}>
            <input
              type="text"
              value={presetName}
              maxLength={40}
              autoFocus
              aria-label="Preset name"
              placeholder="New name"
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setNaming(false);
              }}
            />
            <button type="submit" className="button button-dark">
              Rename
            </button>
            <button
              className="button button-outline"
              type="button"
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
        <div className="lab-stage-preview">
          <ViewToolbar
            views={lab.views}
            view={view}
            viewer={viewer}
            ready={Boolean(schema)}
            onView={(name) => {
              setView(name);
              viewer.current?.setView(name);
            }}
            onReset={reset}
          />
          <div
            ref={box}
            className="lab-viewer"
            role="img"
            aria-label={`Interactive 3D ${kind} preview. Drag to rotate; scroll, pinch or press plus and minus to zoom; 0 fits the view.`}
          >
            {viewerFailed ? (
              <p className="lab-viewer-note">{LAB_COPY.noViewer}</p>
            ) : (
              !preview &&
              !status.error && (
                <p className="lab-viewer-note">{LAB_COPY.firstPreview}</p>
              )
            )}
          </div>
          <p className="lab-caption">
            <span>Drag to rotate · scroll or pinch to zoom · + − keys</span>
            <span>
              {view === "board"
                ? `Mounted on a ${boardAngle}° board`
                : "Flat back on the wall plane"}
            </span>
          </p>
        </div>
        {view === "board" && (
          <BoardAngleControls
            kind={kind}
            angle={boardAngle}
            viewer={viewer}
            onChange={changeBoardAngle}
          />
        )}
        <div
          className={`lab-stage-row ${status.error ? "lab-stage-error" : ""}`}
        >
          <div className={`lab-status ${status.error ? "error" : ""}`}>
            <p role="status" aria-live="polite">
              {status.text}
            </p>
            {status.error && status.retry && (
              <button type="button" onClick={status.retry}>
                Retry
              </button>
            )}
          </div>
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
            Export STL
          </button>
        </div>
      </section>
      <div className="lab-details">
        <section className="lab-card">
          <h3>Side profile</h3>
          {preview ? (
            <Profile data={preview} kind={kind} parameters={parameters} />
          ) : (
            <p className="small-note">{LAB_COPY.waiting}</p>
          )}
        </section>
        <section className="lab-card">
          <h3>Your model</h3>
          <dl className="lab-metrics">
            {preview ? (
              modelMetrics(kind, preview).map((metric) => (
                <Metric key={metric.label} {...metric} />
              ))
            ) : (
              <Metric label="Mesh" value="Preparing…" />
            )}
          </dl>
          <p className="small-note">
            25–40% infill · <GearLink item={GEAR.petg}>PETG</GearLink> at 1.27
            g/cm³ · estimated 1.6 mm shell. Excludes supports and waste; check
            your slicer.{" "}
            <Link href="/how-to-3d-print-climbing-holds#settings">
              How we print holds.
            </Link>
          </p>
          <p className="small-note">
            Millimetres · flat back · original geometry. Upload it like any
            other design when it has earned a place in the pile.
          </p>
          <SafetyNote />
        </section>
      </div>
    </div>
  );
}

// The toolbar above the viewer: the same views in the same order for every
// lab (less any a lab leaves out), zoom, fit and the way back to the start.
function ViewToolbar({
  views,
  view,
  viewer,
  ready,
  onView,
  onReset,
}: {
  views: ViewName[];
  view: ViewName;
  viewer: RefObject<Viewer | null>;
  ready: boolean;
  onView: (view: ViewName) => void;
  onReset: () => void;
}) {
  return (
    <div className="lab-toolbar" role="group" aria-label="Preview angle">
      {views.map((name) => (
        <button
          type="button"
          key={name}
          aria-pressed={view === name}
          onClick={() => onView(name)}
        >
          {VIEW_LABELS[name]}
        </button>
      ))}
      <button
        type="button"
        className="lab-toolbar-end"
        aria-label="Zoom in"
        title="Zoom in (+)"
        onClick={() => viewer.current?.zoom(1.25)}
      >
        <ZoomIn size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Zoom out"
        title="Zoom out (−)"
        onClick={() => viewer.current?.zoom(0.8)}
      >
        <ZoomOut size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        title="Fit the whole hold in view (0)"
        onClick={() => viewer.current?.fit()}
      >
        Fit view
      </button>
      <button type="button" disabled={!ready} onClick={onReset}>
        <RotateCcw size={13} />
        Reset
      </button>
    </div>
  );
}

// The board's angle, shown with the board preview: a number, a slider, the
// 40° standard and an exact side-on view.
function BoardAngleControls({
  kind,
  angle,
  viewer,
  onChange,
}: {
  kind: Kind;
  angle: number;
  viewer: RefObject<Viewer | null>;
  onChange: (angle: number) => void;
}) {
  const id = `${kind}-board-angle`;
  return (
    <div className="lab-board-controls">
      <label htmlFor={id}>Board angle</label>
      <input
        id={id}
        type="number"
        min={0}
        max={MAX_BOARD_ANGLE}
        step={1}
        value={angle}
        aria-describedby={`${id}-hint`}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
      <span>°</span>
      <input
        type="range"
        min={0}
        max={MAX_BOARD_ANGLE}
        step={1}
        value={angle}
        aria-label="Board angle slider"
        aria-describedby={`${id}-hint`}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
      <button type="button" onClick={() => onChange(DEFAULT_BOARD_ANGLE)}>
        40° standard
      </button>
      <button type="button" onClick={() => viewer.current?.setBoardSideView()}>
        Exact side
      </button>
      <p id={`${id}-hint`}>From vertical · 0° is upright</p>
    </div>
  );
}

// Stand-ins for the sliders while the generator wakes up.
function Skeleton() {
  return (
    <div className="lab-skeleton" aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  );
}

function ControlRow({
  control,
  value,
  disabled,
  clamp,
  onChange,
  onReset,
  auto,
}: {
  control: Control;
  value: number;
  disabled: boolean;
  // Snap a typed value into the slider's range; see LabKind.clampTyped.
  clamp: boolean;
  onChange: (key: string, value: number) => void;
  onReset: () => void;
  // An "auto" toggle beside the slider, for settings the generator can fit.
  auto?: { checked: boolean; onChange: (checked: boolean) => void };
}) {
  const id = `lab-${control.key}`;
  // Keep incomplete and out-of-range typing local. In particular, typing
  // "120" must be allowed to pass through "1" and "12" without snapping.
  const [draft, setDraft] = useState<string | null>(null);
  function handle(typed: number) {
    if (!Number.isFinite(typed)) return;
    const next = clamp
      ? Math.min(control.max, Math.max(control.min, typed))
      : typed;
    if (control.key === "screw_count" && !Number.isInteger(next)) return;
    onChange(control.key, next);
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
            value={draft ?? (Number.isFinite(value) ? value : "")}
            disabled={disabled}
            aria-describedby={`${id}-hint`}
            onFocus={(e) => setDraft(e.currentTarget.value)}
            onChange={(e) => {
              setDraft(e.currentTarget.value);
              const typed = e.currentTarget.valueAsNumber;
              if (!clamp || (typed >= control.min && typed <= control.max))
                handle(typed);
            }}
            onBlur={(e) => {
              handle(e.currentTarget.valueAsNumber);
              setDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
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
          disabled={disabled}
          aria-label={`${control.label} slider`}
          aria-describedby={`${id}-hint`}
          onChange={(e) => handle(e.target.valueAsNumber)}
          onDoubleClick={onReset}
        />
        {auto && (
          <label className="lab-toggle">
            <input
              type="checkbox"
              checked={auto.checked}
              disabled={disabled}
              onChange={(e) => auto.onChange(e.target.checked)}
            />
            auto
          </label>
        )}
      </div>
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
