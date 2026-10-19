"use client";

import { cloneCut } from "./cut-profiles";
import { useCanvasPalette } from "./canvas-palette";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Viewer, isDarkTheme } from "@/features/model-viewer/viewer";
import type { ViewName } from "@/features/model-viewer/viewer";
import {
  DEFAULT_BOARD_ANGLE,
  MAX_BOARD_ANGLE,
} from "@/features/model-viewer/board-preview";
import { RotateCcw } from "lucide-react";
import { decodePreview, previewMesh } from "./preview";
import {
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
  SCREW_HEAD,
  SCREW_HOLE,
  controlRanges,
  normalizeParameters,
} from "./controls";
import { SafetyNote } from "@/features/legal/safety-note";
import styles from "./custom-shape-lab.module.css";
import { BrushSizeControl } from "./brush-size-control";
import { drawingContours } from "./drawing-preview";
import { smoothStroke } from "./smoothing";
import { CutProfileEditor } from "./cut-profile-editor";
import type { CutProfile, CutEdge } from "./cut-profiles";

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
type Tool = "brush" | "eraser" | "smooth" | "hole";
const VIEWS: [ViewName, string][] = [
  ["three-quarter", "3D overview"],
  ["board", "On a board"],
  ["side", "Side"],
  ["angled-side", "Angled side"],
  ["top", "Above"],
  ["front", "Front"],
];
export function CustomShapeLab() {
  const [mode, setMode] = useState<"shape" | "cuts" | "preview">("shape");
  const [documentSnapshot, setDocumentSnapshot] = useState(() =>
    serializeDocument(initialDocument),
  );
  const [draftCut, setDraftCut] = useState<CutProfile | null>(null);
  const cutRotation = useRef(0);
  const lastMesh = useRef<ReturnType<typeof decodePreview> | null>(null);
  const previewGeneration = useRef(0);
  function orientCutView(edge: CutEdge, viewBased: boolean) {
    const angles = viewBased
      ? { right: 0, left: Math.PI, top: -Math.PI / 2, bottom: Math.PI / 2 }
      : { top: Math.PI, bottom: 0, left: Math.PI / 2, right: -Math.PI / 2 };
    cutRotation.current = angles[edge];
    if (lastMesh.current)
      viewer.current?.setGeometry(
        previewMesh(lastMesh.current).rotateZ(cutRotation.current),
      );
    setView("side");
    viewer.current?.setView("side");
  }
  function clearCutView() {
    cutRotation.current = 0;
    if (lastMesh.current)
      viewer.current?.setGeometry(previewMesh(lastMesh.current));
  }
  const [smoothStrength, setSmoothStrength] = useState(0.8);
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
  const previewFlight = useRef<Promise<void> | null>(null);
  const [view, setView] = useState<ViewName>("three-quarter");
  const [boardAngle, setBoardAngle] = useState(DEFAULT_BOARD_ANGLE);
  const [fittedSeat, setFittedSeat] = useState<number | null>(null);
  const [revision, setRevision] = useState(0),
    [tool, setTool] = useState<Tool>("brush"),
    [brush, setBrush] = useState(30),
    [eraser, setEraser] = useState(30);
  const [parameters, setParameters] = useState(defaults),
    [message, setMessage] = useState("Preparing preview…"),
    [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false),
    [exporting, setExporting] = useState(false),
    [viewerFailed, setViewerFailed] = useState(false);
  const [editorState, setEditorState] = useState({
    holes: exampleDocument().holes,
    undo: 0,
    redo: 0,
  });
  const [edgeDepthMax, setEdgeDepthMax] = useState(initialEdgeDepthMax);
  const [drawingHeight, setDrawingHeight] = useState(() =>
    materialHeight(initialDocument, 1),
  );
  const diameter = tool === "eraser" ? eraser : brush;
  const colors = useCanvasPalette();
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
      target.fillStyle = colors.background;
      target.fillRect(0, 0, doc.size, doc.size);
      target.beginPath();
      for (const ring of drawingContours(doc)) {
        target.moveTo(ring[0][0], ring[0][1]);
        for (const [x, y] of ring.slice(1)) target.lineTo(x, y);
        target.closePath();
      }
      target.fillStyle = colors.material;
      target.fill("evenodd");
      materialDirty.current = false;
    }
    ctx.drawImage(bitmap.current, 0, 0, doc.size, doc.size);
    ctx.strokeStyle = colors.grid;
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
      ctx.fillStyle = colors.hole;
      ctx.fill();
      ctx.strokeStyle = colors.outline;
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
      ctx.strokeStyle = colors.ink;
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
      queueMicrotask(() => setViewerFailed(true));
    }
    return () => {
      viewer.current?.dispose();
      viewer.current = null;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);
  useEffect(() => {
    materialDirty.current = true;
    viewer.current?.setBackgroundColor(colors.background);
  }, [colors]);
  useEffect(() => {
    const controller = new AbortController();
    const generation = previewGeneration.current;
    const timer = setTimeout(async () => {
      await previewFlight.current;
      if (controller.signal.aborted) return;
      const update = async () => {
        setMessage("Updating preview…");
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "preview",
              previewEncoding: "binary",
              document: {
                ...serializeDocument(drawing.current),
                cuts: draftCut
                  ? [
                      ...drawing.current.cuts
                        .filter((c) => c.id !== draftCut.id)
                        .map(cloneCut),
                      cloneCut(draftCut),
                    ]
                  : drawing.current.cuts.map(cloneCut),
              },
              parameters,
            }),
          });
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error ?? "Could not generate the hold.");
          }
          const data = decodePreview(await response.arrayBuffer());
          if (
            controller.signal.aborted ||
            generation !== previewGeneration.current ||
            active.current?.changed
          )
            return;
          lastMesh.current = data;
          viewer.current?.setGeometry(
            previewMesh(data).rotateZ(cutRotation.current),
            revision === 0,
          );
          setReady(true);
          setFittedSeat(data.seatDepth);
          setMessage(
            `Preview is current · ${data.volume_cm3} cm³ · grid 10 mm`,
          );
        } catch (error) {
          if (
            !controller.signal.aborted &&
            generation === previewGeneration.current
          ) {
            setReady(false);
            setMessage(
              error instanceof Error
                ? error.message
                : "Could not generate preview.",
            );
          }
        }
      };
      const pending = update();
      previewFlight.current = pending;
      await pending;
      if (previewFlight.current === pending) previewFlight.current = null;
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [revision, parameters, draftCut]);
  function checkpoint() {
    undo.current.push(cloneDocument(drawing.current));
    if (undo.current.length > 30) undo.current.shift();
    redo.current = [];
  }
  function commit() {
    materialDirty.current = true;
    setDrawingHeight(materialHeight(drawing.current, 1));
    setDocumentSnapshot(serializeDocument(drawing.current));
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
          "Place holes farther inside the lavender material with enough room for the head recess.",
        );
    } else {
      checkpoint();
      if (tool === "smooth")
        smoothStroke(drawing.current, p, p, diameter, smoothStrength);
      else stroke(drawing.current, p, p, diameter, tool === "eraser");
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
        if (tool === "smooth")
          smoothStroke(
            drawing.current,
            gesture.point,
            p,
            diameter,
            smoothStrength,
          );
        else
          stroke(
            drawing.current,
            gesture.point,
            p,
            diameter,
            tool === "eraser",
          );
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
  const onHistoryShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (mode === "cuts") return;
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      !(event.ctrlKey || event.metaKey) ||
      event.key.toLowerCase() !== "z"
    )
      return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.closest('input:not([type="range"]), textarea, select'))
    )
      return;
    const direction = event.shiftKey ? "redo" : "undo";
    if (!(direction === "undo" ? undo.current : redo.current).length) return;
    event.preventDefault();
    finish();
    history(direction);
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => onHistoryShortcut(event);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  async function download() {
    setExporting(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stl",
          document: serializeDocument(drawing.current),
          parameters,
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "custom-shape.stl";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Export failed.");
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
  function changeBoardAngle(value: number) {
    if (!Number.isFinite(value)) return;
    const angle = Math.max(0, Math.min(MAX_BOARD_ANGLE, Math.round(value)));
    setBoardAngle(angle);
    viewer.current?.setBoardAngle(angle);
  }
  const previewHasError =
    !ready &&
    !["Updating", "Preview is current", "Preparing"].some((prefix) =>
      message.startsWith(prefix),
    );
  return (
    <div
      className={`${styles.layout} ${mode === "preview" ? styles.previewOnly : ""}`}
    >
      <div className={styles.modes} role="group" aria-label="Editing mode">
        {(
          [
            ["shape", "Shape"],
            ["cuts", "Cut Profiles"],
            ["preview", "Preview"],
          ] as const
        ).map(([value, label], index) => (
          <button
            key={value}
            aria-pressed={mode === value}
            onClick={() => {
              finish();
              clearCutView();
              setDraftCut(null);
              setReady(false);
              setRevision((r) => r + 1);
              setMode(value);
            }}
          >
            <span className={styles.stepNumber} aria-hidden="true">
              {index + 1}
            </span>
            {label}
          </button>
        ))}
      </div>
      {mode === "cuts" && (
        <CutProfileEditor
          onPreviewPending={() => {
            previewGeneration.current++;
            setReady(false);
          }}
          onView={orientCutView}
          document={documentSnapshot}
          parameters={parameters}
          endpoint={endpoint}
          onPreview={(cut) => {
            if (cut === draftCut) return;
            setDraftCut(cut);
            setReady(false);
          }}
          onApply={(cuts) => {
            checkpoint();
            drawing.current.cuts = cuts;
            setDraftCut(null);
            commit();
          }}
          onHistory={history}
          undoCount={editorState.undo}
          redoCount={editorState.redo}
          previewReadyId={ready && draftCut ? draftCut.id : null}
          previewError={
            draftCut &&
            !ready &&
            !message.startsWith("Preview is current") &&
            !message.startsWith("Updating")
              ? message
              : ""
          }
        />
      )}
      <section
        hidden={mode !== "shape"}
        className={styles.panel}
        aria-label="Paint editor"
      >
        <div className={styles.panelHeading}>
          <div>
            <h2>Paint your shape</h2>
            <p>Draw the outline of your hold, then add mounting holes.</p>
          </div>
          <span className={styles.badge}>Top view</span>
        </div>
        <div
          className={styles.toolbar}
          role="group"
          aria-label="Painting tools"
        >
          {(["brush", "eraser", "smooth", "hole"] as const).map((t) => (
            <button
              key={t}
              aria-pressed={tool === t}
              onClick={() => setTool(t)}
            >
              {t === "hole"
                ? "Mounting hole"
                : t === "brush"
                  ? "Brush"
                  : t === "smooth"
                    ? "Smooth"
                    : "Eraser"}
            </button>
          ))}
        </div>
        <div className={styles.historyBar}>
          <button
            disabled={!editorState.undo}
            onClick={() => history("undo")}
            title="Undo (Ctrl+Z / Cmd+Z)"
            aria-keyshortcuts="Control+Z Meta+Z"
          >
            Undo
          </button>
          <button
            disabled={!editorState.redo}
            onClick={() => history("redo")}
            title="Redo (Ctrl+Shift+Z / Cmd+Shift+Z)"
            aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
          >
            Redo
          </button>
          <details className={styles.moreActions}>
            <summary>Canvas options</summary>
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
          </details>
        </div>
        {tool !== "hole" && (
          <BrushSizeControl
            label={`${tool} size`}
            value={(diameter * parameters.scale) / RESOLUTION}
            min={(2 * parameters.scale) / RESOLUTION}
            max={(100 * parameters.scale) / RESOLUTION}
            onChange={(mm) =>
              tool === "eraser"
                ? setEraser((mm * RESOLUTION) / parameters.scale)
                : setBrush((mm * RESOLUTION) / parameters.scale)
            }
          />
        )}
        <p className={styles.toolHint}>
          {tool === "hole"
            ? "Click to add a screw hole. Drag a red hole to reposition it."
            : tool === "smooth"
              ? "Brush along the lavender edge to soften bumps and fill small notches."
              : tool === "eraser"
                ? "Brush over lavender material to remove it. Undo brings it back."
                : "Paint lavender to add material. Keep your shape connected."}
        </p>
        {tool === "smooth" && (
          <label className={styles.slider}>
            Smooth strength <span>{Math.round(smoothStrength * 100)}%</span>
            <input
              aria-label="Smooth strength"
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={smoothStrength}
              onChange={(e) => setSmoothStrength(+e.target.value)}
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
          <span className={styles.blueKey}>Lavender: your hold</span> ·{" "}
          <span className={styles.redKey}>Gold: screw holes</span> · Canvas
          width {parameters.scale} mm
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
        <div className={styles.panelHeading}>
          <div>
            <h2>{mode === "preview" ? "Review your hold" : "Live preview"}</h2>
            <p>
              {mode === "cuts"
                ? "Your painted cut appears here automatically."
                : "Check the shape from any angle."}
            </p>
          </div>
          <span className={styles.badge}>
            {ready
              ? "Up to date"
              : previewHasError
                ? "Check settings"
                : "Updating…"}
          </span>
        </div>
        <div
          className={`${styles.toolbar} ${styles.viewToolbar}`}
          role="group"
          aria-label="Preview angle"
        >
          <label className={styles.viewSelect}>
            View
            <select
              aria-label="Camera view"
              value={view}
              onChange={(e) => {
                const next = e.target.value as ViewName;
                clearCutView();
                setView(next);
                viewer.current?.setView(next);
              }}
            >
              {VIEWS.map(([name, label]) => (
                <option key={name} value={name}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => viewer.current?.fit()}>
            Fit
          </button>
          <button
            type="button"
            onClick={() => {
              clearCutView();
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
            <label htmlFor="custom-shape-board-angle">board angle</label>
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
              exact side
            </button>
            <p>from vertical · 0° is upright</p>
          </div>
        )}
        <div
          ref={container}
          className={`lab-viewer ${styles.viewer}`}
          role="img"
          aria-label="Interactive 3D hold preview"
        >
          {viewerFailed && (
            <p>
              3D viewing is unavailable in this browser. Validated STL export
              remains available.
            </p>
          )}
        </div>
        <p className="lab-caption">
          <span>drag to rotate · scroll to zoom</span>
          <span>
            {view === "board"
              ? `mounted on a ${boardAngle}° board`
              : "flat back on the wall plane"}
          </span>
        </p>
        <div className={styles.exportBar}>
          <p className={styles.status} role="status">
            {previewHasError
              ? message
              : draftCut
                ? ready
                  ? "Cut ready. Apply it to include it in your STL."
                  : "Updating your cut…"
                : !ready && message.startsWith("Preview is current")
                  ? "Updating preview…"
                  : message}
          </p>
          <button
            className="button button-dark"
            disabled={!ready || exporting || !!draftCut}
            onClick={download}
          >
            {exporting ? "Exporting…" : "Download STL"}
          </button>
        </div>
        <SafetyNote />
        <div className={styles.settingsHeading}>
          <h3>Hold settings</h3>
          <span>Size, grip & mounting</span>
        </div>
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
                    label: SCREW_HOLE.label,
                    unit: "mm",
                    step: SCREW_HOLE.step,
                  },
                  {
                    key: "headDiameter",
                    label: SCREW_HEAD.label,
                    unit: "mm",
                    step: SCREW_HEAD.step,
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
            <details
              className={styles.controls}
              key={group.title}
              open={group.title === "Shape"}
            >
              <summary>
                {group.title === "Shape"
                  ? "Size & shape"
                  : group.title === "Grip"
                    ? "Grip & rounding"
                    : "Screw holes"}
              </summary>
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
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
