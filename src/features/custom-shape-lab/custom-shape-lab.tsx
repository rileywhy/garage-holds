"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  VIEW_LABELS,
  VIEW_ORDER,
  Viewer,
  isDarkTheme,
} from "@/features/model-viewer/viewer";
import type { ViewName } from "@/features/model-viewer/viewer";
import {
  LAB_COPY,
  PREVIEW_DEBOUNCE_MS,
  labFilename,
  meshExtents,
  withInches,
} from "@/features/labs/conventions";
import {
  EXPORT_TIMEOUT_MS,
  errorReason,
  labRequest,
} from "@/features/labs/lab-request";
import {
  DEFAULT_BOARD_ANGLE,
  MAX_BOARD_ANGLE,
} from "@/features/model-viewer/board-preview";
import { Bookmark, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { trackEvent } from "@/features/analytics/events";
import { previewGeometry } from "@/features/crimp-lab/preview-geometry";
import {
  copyCurrentLink,
  currentSearch,
  linkSearch,
  readLink,
  replaceSearch,
  type LinkParameters,
} from "@/features/lab-link/lab-link";
import {
  HOLES_KEY,
  LINK_LIMIT,
  MASK_KEY,
  decodeMask,
  encodeMask,
  holesFromLink,
  holesToLink,
  linkCodecAvailable,
} from "./link";
import {
  ARTWORK_COLORS,
  RESOLUTION,
  cloneDocument,
  emptyDocument,
  exampleDocument,
  holeFits,
  edgeDepthLimit,
  materialHeight,
  serializeDocument,
  stroke,
  type MaskDocument,
  type ShapeParameters,
} from "./mask";
import {
  DEFAULT_PARAMETERS,
  controlRanges,
  normalizeParameters,
} from "./controls";
import styles from "./custom-shape-lab.module.css";
import { drawingContours } from "./drawing-preview";
import {
  defaultPresetName,
  isSavedValue,
  savedId,
  savedValue,
  uniqueName,
  type LabPreset,
} from "@/features/lab-presets/saved-presets";
import { presetStore, savedWhere } from "@/features/lab-presets/preset-store";

const defaults = DEFAULT_PARAMETERS;
const initialDocument = exampleDocument();
const initialEdgeDepthMax = edgeDepthLimit(
  initialDocument,
  defaults.scale,
  defaults.incut,
  defaults.depth,
  defaults.headDiameter,
);
const endpoint =
  process.env.NODE_ENV === "development"
    ? "/api/custom-shape"
    : "/api/custom_shape";
type Tool = "brush" | "eraser" | "hole";
export function CustomShapeLab({ account = false }: { account?: boolean }) {
  // Presets go to the account when signed in, to this browser otherwise.
  const store = useMemo(() => presetStore("custom-shape", account), [account]);
  const [saved, setSaved] = useState<LabPreset[]>([]);
  const [presetValue, setPresetValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [naming, setNaming] = useState(false);
  const [presetName, setPresetName] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null),
    container = useRef<HTMLDivElement>(null),
    viewer = useRef<Viewer | null>(null);
  const drawing = useRef<MaskDocument>(initialDocument);
  const undo = useRef<MaskDocument[]>([]),
    redo = useRef<MaskDocument[]>([]);
  const active = useRef<{
    point: [number, number];
    hole?: string;
    changed: boolean;
  } | null>(null);
  const cursor = useRef<[number, number] | null>(null);
  const bitmap = useRef<HTMLCanvasElement | null>(null);
  const materialDirty = useRef(true);
  const frame = useRef<number | null>(null);
  const [view, setView] = useState<ViewName>("three-quarter");
  const [boardAngle, setBoardAngle] = useState(DEFAULT_BOARD_ANGLE);
  const [fittedSeat, setFittedSeat] = useState<number | null>(null);
  const [revision, setRevision] = useState(0),
    [tool, setTool] = useState<Tool>("brush"),
    [brush, setBrush] = useState(30),
    [eraser, setEraser] = useState(30);
  const [parameters, setParameters] = useState(defaults),
    [message, setMessage] = useState(LAB_COPY.firstPreview),
    [notice, setNotice] = useState("");
  // The step to try again after the generator failed, shown as a button.
  const [retry, setRetry] = useState<(() => void) | null>(null);
  // The hold's bounding box, for the status line and the export filename.
  const [extents, setExtents] = useState<number[] | null>(null);
  const [ready, setReady] = useState(false),
    [exporting, setExporting] = useState(false),
    [viewerFailed, setViewerFailed] = useState(false);
  const [editorState, setEditorState] = useState({
    holes: exampleDocument().holes,
    undo: 0,
    redo: 0,
  });
  const [edgeDepthMax, setEdgeDepthMax] = useState(initialEdgeDepthMax);
  // Link writing is async (the mask is deflated); only the newest wins, and
  // it reads the sliders through a ref so the callback itself never changes.
  const linkSequence = useRef(0);
  const linkTooLong = useRef(false);
  const latestParameters = useRef(parameters);
  latestParameters.current = parameters;
  const [drawingHeight, setDrawingHeight] = useState(() =>
    materialHeight(initialDocument, 1),
  );
  const diameter = tool === "eraser" ? eraser : brush;
  function renderCanvas() {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const doc = drawing.current;
    const renderScale = 3;
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.clearRect(0, 0, RESOLUTION, RESOLUTION);
    if (!bitmap.current) {
      bitmap.current = document.createElement("canvas");
      bitmap.current.width = doc.size * renderScale;
      bitmap.current.height = doc.size * renderScale;
    }
    if (materialDirty.current) {
      const target = bitmap.current.getContext("2d")!;
      target.setTransform(renderScale, 0, 0, renderScale, 0, 0);
      target.fillStyle = ARTWORK_COLORS.background;
      target.fillRect(0, 0, doc.size, doc.size);
      target.beginPath();
      for (const ring of drawingContours(doc)) {
        target.moveTo(ring[0][0], ring[0][1]);
        for (const [x, y] of ring.slice(1)) target.lineTo(x, y);
        target.closePath();
      }
      target.fillStyle = ARTWORK_COLORS.material;
      target.fill("evenodd");
      materialDirty.current = false;
    }
    ctx.drawImage(bitmap.current, 0, 0, doc.size, doc.size);
    ctx.strokeStyle = "#34405420";
    ctx.lineWidth = 0.35;
    const grid = (10 * doc.size) / parameters.scale;
    ctx.beginPath();
    for (let p = 0; p < doc.size; p += grid) {
      ctx.moveTo(p, 0);
      ctx.lineTo(p, doc.size);
      ctx.moveTo(0, p);
      ctx.lineTo(doc.size, p);
    }
    ctx.stroke();
    for (const h of doc.holes) {
      ctx.beginPath();
      ctx.arc(
        h.x,
        h.y,
        ((parameters.headDiameter / 2) * doc.size) / parameters.scale,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = ARTWORK_COLORS.hole;
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.stroke();
    }
    if (cursor.current) {
      const [x, y] = cursor.current;
      ctx.beginPath();
      ctx.arc(
        x,
        y,
        tool === "hole"
          ? ((parameters.headDiameter / 2) * doc.size) / parameters.scale
          : diameter / 2,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  function paintCanvas() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      renderCanvas();
    });
  }
  // Pointer events update the binary mask immediately. Rasterizing happens at
  // most once per display frame; cursor movement reuses the cached bitmap.
  useEffect(() => {
    paintCanvas();
  });
  useEffect(() => {
    if (!container.current) return;
    try {
      viewer.current = new Viewer(container.current, {
        dark: isDarkTheme(),
      });
    } catch {
      // No WebGL: drawing and export still work without a picture.
      queueMicrotask(() => setViewerFailed(true));
      trackEvent({
        name: "lab_error",
        lab: "custom-shape",
        stage: "start",
        reason: "webgl",
      });
    }
    return () => {
      viewer.current?.dispose();
      viewer.current = null;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);
  // The query for the drawing and settings on screen; empty for the example
  // drawing with default settings. Async because the mask is deflated.
  const linkText = useCallback(async () => {
    const doc = drawing.current;
    const example = exampleDocument();
    const query = new URLSearchParams(
      linkSearch(
        latestParameters.current as unknown as LinkParameters,
        defaults as unknown as LinkParameters,
      ),
    );
    const sameDrawing =
      holesToLink(doc.holes) === holesToLink(example.holes) &&
      doc.material.every((cell, i) => cell === example.material[i]);
    if (!sameDrawing) {
      query.set(MASK_KEY, await encodeMask(doc.material));
      if (doc.holes.length) query.set(HOLES_KEY, holesToLink(doc.holes));
    }
    return query.toString();
  }, []);
  // The address bar always holds the drawing and settings on screen.
  const writeLink = useCallback(async () => {
    if (!linkCodecAvailable()) return;
    const sequence = ++linkSequence.current;
    const text = await linkText();
    if (sequence !== linkSequence.current) return;
    linkTooLong.current = text.length > LINK_LIMIT;
    replaceSearch(linkTooLong.current || !text ? "" : `?${text}`);
  }, [linkText]);
  // Presets load once; a failure there never blocks the lab.
  useEffect(() => {
    let cancelled = false;
    store
      .list()
      .then((list) => {
        if (!cancelled) setSaved(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [store]);
  // Apply a link query: the painted mask, the holes and the sliders. Once on
  // arrival (keeping whatever is drawn when the link has no drawing), and
  // for a saved preset (which starts from the example drawing).
  async function applySearch(
    search: string,
    fresh: boolean,
    stale: () => boolean,
  ) {
    const query = new URLSearchParams(search);
    const link = readLink(search, defaults as unknown as LinkParameters);
    const mask = query.get(MASK_KEY);
    const holes = query.get(HOLES_KEY);
    if (!fresh && !link && mask === null && holes === null) return false;
    const material =
      mask !== null && linkCodecAvailable()
        ? await decodeMask(mask, RESOLUTION ** 2)
        : null;
    if (stale()) return false;
    if (fresh || material || holes !== null) {
      const doc = fresh ? exampleDocument() : cloneDocument(drawing.current);
      if (material) {
        doc.material = material;
        doc.holes = [];
      }
      if (holes !== null) doc.holes = holesFromLink(holes, RESOLUTION);
      drawing.current = doc;
      undo.current = [];
      redo.current = [];
    }
    if (fresh || link) {
      const next = {
        ...defaults,
        ...((link?.parameters ?? {}) as Partial<ShapeParameters>),
      };
      setParameters(
        normalizeParameters(next, materialHeight(drawing.current, next.scale)),
      );
    }
    commit();
    return true;
  }
  useEffect(() => {
    let cancelled = false;
    void applySearch(currentSearch(), false, () => cancelled).then(
      (applied) => {
        if (applied)
          trackEvent({
            name: "lab_settings",
            lab: "custom-shape",
            action: "open",
          });
      },
    );
    return () => {
      cancelled = true;
    };
    // Runs once, on arrival; applySearch reads refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setMessage(LAB_COPY.updating);
      setRetry(null);
      try {
        const response = await labRequest(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "preview",
            document: serializeDocument(drawing.current),
            parameters,
          }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (controller.signal.aborted || active.current?.changed) return;
        viewer.current?.setGeometry(previewGeometry(data), revision === 0);
        const size = meshExtents(data.vertices);
        setExtents(size);
        setReady(true);
        setFittedSeat(data.seatDepth);
        setMessage(
          `Preview is current · ${withInches(size)} · ${data.volume_cm3} cm³`,
        );
        void writeLink();
      } catch (error) {
        if (!controller.signal.aborted) {
          trackEvent({
            name: "lab_error",
            lab: "custom-shape",
            stage: "preview",
            reason: errorReason(error),
          });
          setReady(false);
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not generate preview.",
          );
          setRetry(() => () => setRevision((r) => r + 1));
        }
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [revision, parameters, writeLink]);
  async function copyLink() {
    await writeLink();
    if (linkTooLong.current) {
      setNotice(
        "This drawing is too detailed to fit in a link. Download the STL instead.",
      );
      return;
    }
    const copied = await copyCurrentLink();
    if (copied)
      trackEvent({ name: "lab_settings", lab: "custom-shape", action: "link" });
    setNotice(
      copied
        ? "Link copied. Anyone who opens it gets this drawing and these settings."
        : "Could not reach the clipboard. Copy the address from the address bar instead.",
    );
  }
  function checkpoint() {
    undo.current.push(cloneDocument(drawing.current));
    if (undo.current.length > 30) undo.current.shift();
    redo.current = [];
  }
  function commit() {
    materialDirty.current = true;
    setPresetValue("");
    setDrawingHeight(materialHeight(drawing.current, 1));
    setParameters((p) => {
      const next = normalizeParameters(
        p,
        materialHeight(drawing.current, p.scale),
      );
      return next.bodyTaper === p.bodyTaper
        ? p
        : { ...p, bodyTaper: next.bodyTaper };
    });
    setEditorState({
      holes: drawing.current.holes.map((h) => ({ ...h })),
      undo: undo.current.length,
      redo: redo.current.length,
    });
    setEdgeDepthMax(
      edgeDepthLimit(
        drawing.current,
        parameters.scale,
        parameters.incut,
        parameters.depth,
        parameters.headDiameter,
      ),
    );
    setReady(false);
    setRevision((r) => r + 1);
    paintCanvas();
  }
  function point(
    event: React.PointerEvent<HTMLCanvasElement>,
  ): [number, number] {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) * RESOLUTION) / rect.width,
      ((event.clientY - rect.top) * RESOLUTION) / rect.height,
    ];
  }
  function down(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = point(event);
    cursor.current = p;
    setNotice("");
    if (tool === "hole") {
      const hit = drawing.current.holes.find(
        (h) =>
          Math.hypot(h.x - p[0], h.y - p[1]) <
          Math.max(8, (7 * RESOLUTION) / parameters.scale),
      );
      if (hit) {
        checkpoint();
        active.current = { point: p, hole: hit.id, changed: false };
      } else if (drawing.current.holes.length >= 12)
        setNotice("Use at most 12 mounting holes.");
      else if (
        holeFits(
          drawing.current,
          ...p,
          parameters.scale,
          undefined,
          parameters.headDiameter,
        )
      ) {
        checkpoint();
        const id = crypto.randomUUID();
        drawing.current.holes.push({ id, x: p[0], y: p[1] });
        active.current = { point: p, hole: id, changed: true };
        commit();
      } else
        setNotice(
          "Place holes farther inside the blue material with enough room for the head recess.",
        );
    } else {
      checkpoint();
      stroke(drawing.current, p, p, diameter, tool === "eraser");
      materialDirty.current = true;
      active.current = { point: p, changed: true };
      setReady(false);
    }
    paintCanvas();
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    const p = point(event);
    cursor.current = p;
    const gesture = active.current;
    if (gesture) {
      if (gesture.hole) {
        if (
          holeFits(
            drawing.current,
            ...p,
            parameters.scale,
            gesture.hole,
            parameters.headDiameter,
          )
        ) {
          const h = drawing.current.holes.find((h) => h.id === gesture.hole)!;
          h.x = p[0];
          h.y = p[1];
          gesture.changed = true;
          setReady(false);
        }
      } else {
        stroke(drawing.current, gesture.point, p, diameter, tool === "eraser");
        materialDirty.current = true;
        gesture.point = p;
        gesture.changed = true;
      }
    }
    paintCanvas();
  }
  function finish() {
    if (active.current?.changed) commit();
    active.current = null;
  }
  function history(direction: "undo" | "redo") {
    const source = direction === "undo" ? undo : redo,
      dest = direction === "undo" ? redo : undo;
    const doc = source.current.pop();
    if (doc) {
      dest.current.push(cloneDocument(drawing.current));
      drawing.current = doc;
      commit();
    }
  }
  async function download() {
    setExporting(true);
    setMessage(LAB_COPY.building);
    setRetry(null);
    try {
      const response = await labRequest(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stl",
          document: serializeDocument(drawing.current),
          parameters,
        }),
        timeoutMs: EXPORT_TIMEOUT_MS,
      });
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = labFilename(
        "custom-shape",
        extents ?? [parameters.scale, parameters.scale, parameters.depth],
        "stl",
      );
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      trackEvent({ name: "export_stl", lab: "custom-shape" });
      setMessage(LAB_COPY.exported);
    } catch (error) {
      trackEvent({
        name: "lab_error",
        lab: "custom-shape",
        stage: "export",
        reason: errorReason(error),
      });
      setMessage(error instanceof Error ? error.message : "Export failed.");
      setRetry(() => download);
    } finally {
      setExporting(false);
    }
  }
  function changeParameter(
    key: Exclude<keyof ShapeParameters, "autoSeat" | "gripAllSides">,
    value: number,
  ) {
    if (!Number.isFinite(value)) return;
    setReady(false);
    setPresetValue("");
    setParameters((p) => {
      const next = normalizeParameters(
        {
          ...p,
          [key]: value,
          ...(key === "seatDepth" ? { autoSeat: false } : {}),
        },
        materialHeight(drawing.current, key === "scale" ? value : p.scale),
      );
      setEdgeDepthMax(
        edgeDepthLimit(
          drawing.current,
          next.scale,
          next.incut,
          next.depth,
          next.headDiameter,
        ),
      );
      return next;
    });
  }
  function resetParameter(
    key: Exclude<keyof ShapeParameters, "autoSeat" | "gripAllSides">,
  ) {
    setReady(false);
    setParameters((p) => {
      const next = normalizeParameters(
        {
          ...p,
          [key]: defaults[key],
          ...(key === "seatDepth" ? { autoSeat: true } : {}),
        },
        materialHeight(
          drawing.current,
          key === "scale" ? defaults.scale : p.scale,
        ),
      );
      setEdgeDepthMax(
        edgeDepthLimit(
          drawing.current,
          next.scale,
          next.incut,
          next.depth,
          next.headDiameter,
        ),
      );
      return next;
    });
  }
  // One click: the drawing and settings on screen, named after the size.
  async function saveAsPreset() {
    setSaving(true);
    try {
      const text = await linkText();
      if (text.length > LINK_LIMIT)
        throw new Error(
          "This drawing is too detailed to keep as a preset. Download the STL instead.",
        );
      const name = uniqueName(
        defaultPresetName("custom-shape", parameters),
        saved.map((p) => p.name),
      );
      const list = await store.save(name, text ? `?${text}` : "");
      const made = list.find((p) => p.name === name) ?? list[0];
      setSaved(list);
      if (made) setPresetValue(savedValue(made.id));
      trackEvent({
        name: "lab_settings",
        lab: "custom-shape",
        action: "preset",
      });
      setNotice(savedWhere(account, name));
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function applyPreset(value: string) {
    const found = saved.find((p) => p.id === savedId(value));
    if (!found) return;
    setNaming(false);
    await applySearch(found.search, true, () => false);
    setPresetValue(value);
    setNotice(`Opened “${found.name}”.`);
  }
  function startRenaming() {
    const found = saved.find((p) => p.id === savedId(presetValue));
    setPresetName(found?.name ?? "");
    setNaming(true);
  }
  async function renameSavedPreset(event: React.FormEvent) {
    event.preventDefault();
    const wanted = presetName.trim().replace(/\s+/g, " ").toLowerCase();
    try {
      const list = await store.rename(savedId(presetValue), presetName);
      const renamed = list.find((p) => p.name.toLowerCase() === wanted);
      setSaved(list);
      if (renamed) setPresetValue(savedValue(renamed.id));
      setNaming(false);
      setNotice(`Renamed to “${renamed?.name ?? presetName}”.`);
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  async function removePreset() {
    if (!isSavedValue(presetValue)) return;
    const id = savedId(presetValue);
    const name = saved.find((p) => p.id === id)?.name ?? "";
    try {
      setSaved(await store.remove(id));
      setPresetValue("");
      setNotice(`Deleted the preset “${name}”.`);
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  function changeBoardAngle(value: number) {
    if (!Number.isFinite(value)) return;
    const angle = Math.max(0, Math.min(MAX_BOARD_ANGLE, Math.round(value)));
    setBoardAngle(angle);
    viewer.current?.setBoardAngle(angle);
  }
  return (
    <div className={styles.layout}>
      <section className={styles.panel} aria-label="Paint editor">
        <div className={styles.toolbar}>
          {(["brush", "eraser", "hole"] as const).map((t) => (
            <button
              key={t}
              aria-pressed={tool === t}
              onClick={() => setTool(t)}
            >
              {t === "hole"
                ? "Mounting hole"
                : t === "brush"
                  ? "Brush"
                  : "Eraser"}
            </button>
          ))}
          <button disabled={!editorState.undo} onClick={() => history("undo")}>
            Undo
          </button>
          <button disabled={!editorState.redo} onClick={() => history("redo")}>
            Redo
          </button>
          <button
            onClick={() => {
              checkpoint();
              drawing.current = emptyDocument();
              commit();
            }}
          >
            Clear
          </button>
          <button
            onClick={() => {
              checkpoint();
              drawing.current = exampleDocument();
              commit();
            }}
          >
            Example shape
          </button>
        </div>
        {tool !== "hole" && (
          <label className={styles.slider}>
            {tool === "brush" ? "Brush" : "Eraser"} diameter{" "}
            <span>
              {Math.round((diameter * parameters.scale) / RESOLUTION)} mm
            </span>
            <input
              aria-label={`${tool} size`}
              type="range"
              min={2}
              max={100}
              value={diameter}
              onChange={(e) =>
                tool === "brush"
                  ? setBrush(+e.target.value)
                  : setEraser(+e.target.value)
              }
            />
          </label>
        )}
        <canvas
          ref={canvas}
          className={styles.canvas}
          width={RESOLUTION * 3}
          height={RESOLUTION * 3}
          aria-label="Paint hold material. Switch to eraser to remove material or mounting hole to place screws."
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
          onPointerLeave={() => {
            if (!active.current) {
              cursor.current = null;
              paintCanvas();
            }
          }}
        />
        <p className={styles.hint}>
          Blue: material · red: screw recess · white: empty. Drag red holes to
          move them. Scale is the width of the full canvas.
        </p>
        <div className={styles.holes}>
          {editorState.holes.map((h, i) => (
            <button
              key={h.id}
              onClick={() => {
                checkpoint();
                drawing.current.holes = drawing.current.holes.filter(
                  (v) => v.id !== h.id,
                );
                commit();
              }}
            >
              Delete hole {i + 1}
            </button>
          ))}
        </div>
        <p role="status">{notice}</p>
      </section>
      <section
        className={`${styles.stage} ${styles.panel}`}
        aria-label="Generated hold"
      >
        <div className="lab-toolbar" role="group" aria-label="Preview angle">
          {VIEW_ORDER.map((name) => (
            <button
              type="button"
              key={name}
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
          <button
            type="button"
            onClick={() => {
              setView("three-quarter");
              changeBoardAngle(DEFAULT_BOARD_ANGLE);
              viewer.current?.setView("three-quarter");
              viewer.current?.fit();
            }}
          >
            <RotateCcw size={13} />
            Reset view
          </button>
        </div>
        {view === "board" && (
          <div className="lab-board-controls">
            <label htmlFor="custom-shape-board-angle">Board angle</label>
            <input
              id="custom-shape-board-angle"
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
              Exact side
            </button>
            <p>From vertical · 0° is upright</p>
          </div>
        )}
        <div
          ref={container}
          className="lab-viewer"
          role="img"
          aria-label="Interactive 3D hold preview. Drag to rotate; scroll, pinch or press plus and minus to zoom; 0 fits the view."
        >
          {viewerFailed ? (
            <p className="lab-viewer-note">{LAB_COPY.noViewer}</p>
          ) : (
            !extents &&
            !retry && <p className="lab-viewer-note">{LAB_COPY.firstPreview}</p>
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
        <div className={styles.controlScroll}>
          {(
            [
              {
                title: "Grip",
                controls: [
                  { key: "incut", label: "Incut / slope", unit: "°", step: 1 },
                  {
                    key: "gripDepth",
                    label: "Edge depth",
                    unit: "mm",
                    step: 0.5,
                  },
                  {
                    key: "lipRadius",
                    label: "Lip rounding",
                    unit: "mm",
                    step: 0.5,
                  },
                ],
              },
              {
                title: "Shape",
                controls: [
                  { key: "scale", label: "Overall scale", unit: "mm", step: 1 },
                  { key: "depth", label: "Body depth", unit: "mm", step: 1 },
                  {
                    key: "bodyTaper",
                    label: "Body taper",
                    unit: "°",
                    step: 0.1,
                  },
                  {
                    key: "bodyRounding",
                    label: "Body rounding",
                    unit: "mm",
                    step: 0.5,
                  },
                ],
              },
              {
                title: "Mounting",
                controls: [
                  {
                    key: "shankDiameter",
                    label: "Screw shank diameter",
                    unit: "mm",
                    step: 0.1,
                  },
                  {
                    key: "headDiameter",
                    label: "Head recess diameter",
                    unit: "mm",
                    step: 0.1,
                  },
                  {
                    key: "seatDepth",
                    label: "Seat above wall",
                    unit: "mm",
                    step: 0.5,
                  },
                ],
              },
            ] as const
          ).map((group) => (
            <div className={styles.controls} key={group.title}>
              <h3>{group.title}</h3>
              {group.title === "Grip" && (
                <label className="lab-toggle">
                  <input
                    type="checkbox"
                    checked={parameters.gripAllSides}
                    onChange={(e) => {
                      setReady(false);
                      setParameters((p) => ({
                        ...p,
                        gripAllSides: e.target.checked,
                      }));
                    }}
                  />
                  Apply grip edits to all sides
                </label>
              )}
              {group.controls.map((c) => {
                const range = controlRanges(
                  parameters,
                  (edgeDepthMax * parameters.scale) / defaults.scale,
                  drawingHeight * parameters.scale,
                )[c.key];
                const value =
                  c.key === "seatDepth" && parameters.autoSeat
                    ? Math.max(
                        range.min,
                        Math.min(range.max, fittedSeat ?? parameters.seatDepth),
                      )
                    : parameters[c.key];
                return (
                  <div className="lab-control" key={c.key}>
                    <div className="lab-control-head">
                      <label htmlFor={`custom-${c.key}`}>{c.label}</label>
                      <span className="lab-number">
                        <input
                          aria-label={`${c.label} value`}
                          type="number"
                          min={range.min}
                          max={range.max}
                          step={c.step}
                          value={value}
                          onChange={(e) =>
                            changeParameter(c.key, e.target.valueAsNumber)
                          }
                        />
                        {c.unit}
                        <button
                          className="lab-control-reset"
                          title={`Reset ${c.label}`}
                          aria-label={`Reset ${c.label}`}
                          onClick={() => resetParameter(c.key)}
                        >
                          <RotateCcw size={13} />
                        </button>
                      </span>
                    </div>
                    <div className="lab-slider-with-auto">
                      <input
                        id={`custom-${c.key}`}
                        aria-label={c.label}
                        type="range"
                        min={range.min}
                        max={range.max}
                        step={c.step}
                        value={value}
                        onDoubleClick={() => resetParameter(c.key)}
                        onChange={(e) =>
                          changeParameter(c.key, e.target.valueAsNumber)
                        }
                      />
                      {c.key === "seatDepth" && (
                        <label className="lab-toggle">
                          <input
                            aria-label="Automatic screw seat"
                            type="checkbox"
                            checked={parameters.autoSeat}
                            onChange={(e) => {
                              setReady(false);
                              if (e.target.checked) setFittedSeat(null);
                              setParameters((p) =>
                                normalizeParameters(
                                  {
                                    ...p,
                                    autoSeat: e.target.checked,
                                  },
                                  materialHeight(drawing.current, p.scale),
                                ),
                              );
                            }}
                          />
                          auto
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
              <p className="lab-hint">
                {group.title === "Grip"
                  ? "Grip edits affect the top of your drawing by default. Enable all sides to apply incut, edge depth, and lip rounding around the hold."
                  : group.title === "Shape"
                    ? "Body taper makes the bottom thinner while keeping the top grabbing edge at full depth."
                    : "Seat height changes countersink depth. Manual adjustment turns auto off. Recess diameter changes the cut, never the hole centers or body dimensions."}
              </p>
            </div>
          ))}
          <div
            className={`lab-status ${retry ? "error" : ""} ${styles.status}`}
          >
            <p role="status" aria-live="polite">
              {!ready && message.startsWith("Preview is current")
                ? LAB_COPY.updating
                : message}
            </p>
            {retry && (
              <button type="button" onClick={retry}>
                Retry
              </button>
            )}
          </div>
          <div className={styles.actions}>
            <button
              className="button button-dark"
              type="button"
              disabled={!ready || exporting}
              onClick={download}
            >
              {exporting ? "Exporting…" : "Export STL"}
            </button>
            <button
              className="button button-outline"
              type="button"
              disabled={!ready || exporting}
              onClick={copyLink}
              title="Copy a link that opens this drawing and these settings"
            >
              Copy link
            </button>
            <button
              className="button button-outline"
              type="button"
              disabled={!ready || exporting || saving}
              onClick={saveAsPreset}
              title={
                account
                  ? "Keep this drawing and these settings under Saved and in My presets"
                  : "Keep this drawing and these settings in this browser"
              }
            >
              <Bookmark size={15} aria-hidden="true" /> Save as preset
            </button>
            {saved.length > 0 && (
              <select
                className="lab-preset-select"
                aria-label="My presets"
                value={presetValue}
                onChange={(e) => void applyPreset(e.target.value)}
              >
                <option value="">My presets…</option>
                {saved.map((p) => (
                  <option key={p.id} value={savedValue(p.id)}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            {isSavedValue(presetValue) && !naming && (
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
        </div>
      </section>
    </div>
  );
}
