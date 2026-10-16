"use client";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { ShapeParameters, serializeDocument } from "./mask";
import {
  cloneCut,
  newCut,
  type CutProfile,
  type CutEdge,
} from "./cut-profiles";
import {
  paintProfile,
  smoothPaintStroke,
  CUT_RESOLUTION,
} from "./profile-paint";
import { drawingContours } from "./drawing-preview";
import { profileViewport } from "./profile-viewport";
import styles from "./custom-shape-lab.module.css";
import { BrushSizeControl } from "./brush-size-control";
import { useCanvasPalette } from "./canvas-palette";

type Reference = {
  segments: [number, number][][];
  outlines: [number, number][][];
  holes: { index: number; center: number; outline: [number, number][] }[];
  anchor: [number, number];
  height: number;
  width: number;
};
type Props = {
  document: ReturnType<typeof serializeDocument>;
  parameters: ShapeParameters;
  endpoint: string;
  onApply: (cuts: CutProfile[]) => void;
  onPreview: (cut: CutProfile | null) => void;
  onPreviewPending: () => void;
  onView: (edge: CutEdge, viewBased: boolean) => void;
  onHistory: (direction: "undo" | "redo") => void;
  undoCount: number;
  redoCount: number;
  previewReadyId: string | null;
  previewError: string;
};
function sectionHits(reference: Reference | null, z: number) {
  if (!reference) return [];
  const hits: number[] = [];
  for (const [a, b] of reference.segments) {
    if ((a[1] <= z && z < b[1]) || (b[1] <= z && z < a[1]))
      hits.push(a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]));
  }
  return [...new Set(hits.map((v) => Math.round(v * 1e6) / 1e6))].sort(
    (a, b) => a - b,
  );
}
export function CutProfileEditor(props: Props) {
  const {
    document: doc,
    parameters,
    endpoint,
    onApply,
    onPreview,
    onHistory,
    undoCount,
    redoCount,
  } = props;
  const colors = useCanvasPalette();
  const [draft, setDraft] = useState<CutProfile | null>(null);
  const [loadedReference, setLoadedReference] = useState<{
    source: CutProfile;
    document: typeof doc;
    parameters: ShapeParameters;
    data: Reference;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [tool, setTool] = useState<"draw" | "erase" | "smooth">("draw");
  const [smoothStrength, setSmoothStrength] = useState(0.8);
  const [gestureRevision, setGestureRevision] = useState(0);
  const [brushSize, setBrushSize] = useState(6);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [past, setPast] = useState<CutProfile[]>([]),
    [future, setFuture] = useState<CutProfile[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<{
    before: CutProfile;
    point: [number, number];
    current: CutProfile;
  } | null>(null);
  const id = draft?.id,
    edge = draft?.edge,
    position = draft?.position,
    anchorX = draft?.anchor?.[0],
    anchorY = draft?.anchor?.[1],
    viewBased = draft?.viewBased ?? false;
  // Reference geometry depends on placement and the base, not curve strokes.
  const sectionCut = useMemo<CutProfile | null>(
    () =>
      id && edge && position !== undefined
        ? {
            ...newCut(id),
            edge,
            viewBased,
            position,
            name: "Selected region",
            anchor:
              anchorX !== undefined && anchorY !== undefined
                ? [anchorX, anchorY]
                : null,
          }
        : null,
    [id, edge, position, anchorX, anchorY, viewBased],
  );
  const reference =
    loadedReference?.source === sectionCut &&
    loadedReference?.document === doc &&
    loadedReference?.parameters === parameters
      ? loadedReference.data
      : null;
  useEffect(() => {
    if (!sectionCut) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setMessage("Loading section…");
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "section",
            document: doc,
            parameters,
            sectionCut,
          }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (controller.signal.aborted) return;
        setLoadedReference({
          source: sectionCut,
          document: doc,
          parameters,
          data,
        });
        setMessage("");
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadedReference(null);
          setMessage(
            error instanceof Error ? error.message : "Section unavailable.",
          );
        }
      }
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [doc, parameters, endpoint, sectionCut]);
  const sectionX = reference?.segments.flatMap((segment) =>
    segment.map((p) => p[0]),
  ) ?? [0, parameters.scale];
  const margin = Math.max(12, parameters.depth / 4);
  const xMin = Math.min(
    Math.min(0, ...sectionX) - margin,
    draft?.paint?.min ?? Infinity,
  );
  const xMax = Math.max(
    Math.max(1, ...sectionX) + margin,
    draft?.paint?.max ?? -Infinity,
  );
  const heightOffset = draft?.heightOffset ?? 0;
  const zMin = Math.min(-margin, (draft?.paint?.bottom ?? 0) + heightOffset);
  const zMax = Math.max(
    parameters.depth + margin,
    (draft?.paint?.top ?? parameters.depth) + heightOffset,
  );
  const hasCut = draft
    ? draft.paint
      ? draft.paint.material.some(Boolean)
      : draft.profile.some((v) => v > 0)
    : false;
  const paint = draft?.paint;
  const updatePreview = useEffectEvent(() => {
    onPreview(
      draft && reference && hasCut
        ? { ...draft, anchor: reference.anchor, enabled: true }
        : null,
    );
  });
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!gesture.current) updatePreview();
    }, 0);
    return () => clearTimeout(timer);
  }, [draft, reference, hasCut, gestureRevision]);
  const paintedContours = useMemo(
    () =>
      paint
        ? drawingContours({
            version: 1,
            size: paint.size,
            material: Uint8Array.from(paint.material),
            holes: [],
            cuts: [],
          })
        : [],
    [paint],
  );
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !draft) return;
    const width = 640,
      height = 420;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    ctx.canvas.width = width * ratio;
    ctx.canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);
    const { x, y, left, right, top, bottom, scale } = profileViewport(
      xMin,
      xMax,
      parameters.depth,
      zMin,
      zMax,
    );
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = colors.ink;
    ctx.font = "12px Arial";
    const gridStep = Math.max(5, Math.ceil((xMax - xMin) / 8 / 5) * 5);
    for (
      let mm = Math.ceil(xMin / gridStep) * gridStep;
      mm <= xMax;
      mm += gridStep
    ) {
      ctx.beginPath();
      ctx.moveTo(x(mm), top);
      ctx.lineTo(x(mm), bottom);
      ctx.stroke();
      ctx.fillText(`${mm}`, x(mm) - 5, bottom + 24);
    }
    for (let mm = Math.ceil(zMin / 5) * 5; mm <= zMax; mm += 5) {
      ctx.beginPath();
      ctx.moveTo(left, y(mm));
      ctx.lineTo(right, y(mm));
      ctx.stroke();
      ctx.fillText(`${mm}`, left - 30, y(mm) + 4);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, right - left, bottom - top);
    ctx.clip();
    if (reference) {
      ctx.fillStyle = colors.materialFill;
      ctx.beginPath();
      for (const ring of reference.outlines) {
        ring.forEach(([px, z], i) => {
          if (i === 0) ctx.moveTo(x(px), y(z));
          else ctx.lineTo(x(px), y(z));
        });
        ctx.closePath();
      }
      ctx.fill("evenodd");
      ctx.strokeStyle = colors.material;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.fillStyle = colors.cutFill;
    ctx.save();
    if (draft.paint) {
      const paint = draft.paint,
        dx = (paint.max - paint.min) / paint.size,
        paintTop = paint.top ?? parameters.depth,
        dz = (paintTop - (paint.bottom ?? 0)) / paint.size;
      ctx.beginPath();
      for (const ring of paintedContours) {
        ring.forEach(([px, py], i) => {
          const xx = x(paint.min + px * dx),
            yy = y(paintTop - py * dz + heightOffset);
          if (i === 0) ctx.moveTo(xx, yy);
          else ctx.lineTo(xx, yy);
        });
        ctx.closePath();
      }
      ctx.fill("evenodd");
    } else if (draft.profile.some((v) => v > 0)) {
      ctx.strokeStyle = colors.cut;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x(0), y(4));
      draft.profile.forEach((amount, i) => {
        const z = 4 + ((parameters.depth - 6) * i) / (draft.profile.length - 1);
        const surface = sectionHits(reference, z)[0] ?? 0;
        ctx.lineTo(x(surface + amount * draft.depth), y(z));
      });
      ctx.lineTo(x(0), y(parameters.depth - 2));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    if (reference) {
      ctx.save();
      ctx.strokeStyle = colors.hole;
      ctx.fillStyle = colors.holeFill;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      const labels: { center: number; indices: number[] }[] = [];
      for (const hole of reference.holes) {
        ctx.beginPath();
        hole.outline.forEach(([px, z], i) => {
          if (i === 0) ctx.moveTo(x(px), y(z));
          else ctx.lineTo(x(px), y(z));
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        const label = labels.find(
          (label) => Math.abs(x(label.center) - x(hole.center)) < 14,
        );
        if (label) label.indices.push(hole.index);
        else labels.push({ center: hole.center, indices: [hole.index] });
      }
      ctx.fillStyle = colors.hole;
      for (const label of labels)
        ctx.fillText(label.indices.join(","), x(label.center) + 3, y(2));
      ctx.restore();
    }
    if (cursor) {
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(
        x(cursor[0]),
        y(cursor[1] + heightOffset),
        (brushSize * scale) / 2,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.restore();
  }, [
    colors,
    draft,
    reference,
    parameters.depth,
    xMax,
    xMin,
    zMin,
    zMax,
    brushSize,
    cursor,
    paintedContours,
    heightOffset,
  ]);
  function open(cut: CutProfile) {
    props.onView(cut.edge, cut.viewBased ?? false);
    setDraft(cloneCut(cut));
    setPast([]);
    setFuture([]);
    onPreview(null);
  }
  function edit(next: CutProfile) {
    if (next.edge !== draft?.edge)
      props.onView(next.edge, next.viewBased ?? false);
    if (draft) setPast((p) => [...p, draft].slice(-40));
    setFuture([]);
    setDraft(next);
    props.onPreviewPending();
  }
  function history(direction: "undo" | "redo") {
    const source = direction === "undo" ? past : future;
    if (!source.length) {
      onPreview(null);
      onHistory(direction);
      return;
    }
    const next = source[source.length - 1];
    if (direction === "undo") {
      setPast(source.slice(0, -1));
      if (draft) setFuture((f) => [...f, draft]);
    } else {
      setFuture(source.slice(0, -1));
      if (draft) setPast((p) => [...p, draft]);
    }
    props.onView(next.edge, next.viewBased ?? false);
    setDraft(next);
    props.onPreviewPending();
  }
  const shortcut = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      !(event.ctrlKey || event.metaKey) ||
      event.key.toLowerCase() !== "z"
    )
      return;
    if (
      event.target instanceof HTMLElement &&
      (event.target.isContentEditable ||
        event.target.closest('input:not([type="range"]),textarea,select'))
    )
      return;
    event.preventDefault();
    history(event.shiftKey ? "redo" : "undo");
  });
  useEffect(() => {
    const handle = (e: KeyboardEvent) => shortcut(e);
    window.document.addEventListener("keydown", handle);
    return () => window.document.removeEventListener("keydown", handle);
  }, []);
  function point(
    event: React.PointerEvent<HTMLCanvasElement>,
  ): [number, number] {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) * 640) / box.width,
      py = ((event.clientY - box.top) * 420) / box.height;
    const [x, z] = profileViewport(
      xMin,
      xMax,
      parameters.depth,
      zMin,
      zMax,
    ).point(px, py);
    return [x, z - heightOffset];
  }
  function brushDraft(cut: CutProfile): CutProfile {
    if (cut.paint || !cut.profile.some((v) => v > 0)) return cut;
    const material = Array(CUT_RESOLUTION ** 2).fill(0);
    for (let row = 0; row < CUT_RESOLUTION; row++) {
      const z = parameters.depth * (1 - (row + 0.5) / CUT_RESOLUTION);
      if (z < 4 || z > parameters.depth - 2) continue;
      const t = ((z - 4) / (parameters.depth - 6)) * 32,
        i = Math.min(31, Math.floor(t));
      const amount =
        (cut.profile[i] * (1 - (t - i)) + cut.profile[i + 1] * (t - i)) *
        cut.depth;
      const surface = sectionHits(reference, z)[0] ?? 0;
      if (amount <= 0) continue;
      for (let col = 0; col < CUT_RESOLUTION; col++)
        if (
          xMin + ((col + 0.5) / CUT_RESOLUTION) * (xMax - xMin) <=
          surface + amount
        )
          material[row * CUT_RESOLUTION + col] = 1;
    }
    return {
      ...cut,
      paint: { size: CUT_RESOLUTION, min: xMin, max: xMax, material },
    };
  }
  function finish() {
    const g = gesture.current;
    if (!g) return;
    setPast((p) => [...p, g.before].slice(-40));
    setFuture([]);
    gesture.current = null;
    setGestureRevision((revision) => revision + 1);
    props.onPreviewPending();
  }
  function applyBrush(
    cut: CutProfile,
    from: [number, number],
    to: [number, number],
  ) {
    const painted = brushDraft(cut);
    return tool === "smooth"
      ? smoothPaintStroke(
          painted,
          from,
          to,
          brushSize,
          smoothStrength,
          parameters.depth,
        )
      : paintProfile(
          painted,
          from,
          to,
          brushSize,
          tool === "erase",
          xMin,
          xMax,
          parameters.depth,
          zMin - heightOffset,
          zMax - heightOffset,
        );
  }
  function confirmed(): CutProfile | null {
    return draft && reference
      ? { ...draft, anchor: reference.anchor, enabled: true }
      : null;
  }
  return (
    <section className={styles.panel} aria-label="Cut profile editor">
      <div className={styles.panelHeading}>
        <div>
          <h2>Carve your hold</h2>
          <p>Paint the material you want to remove. Watch it change in 3D.</p>
        </div>
        <span className={styles.badge}>Side view</span>
      </div>
      <div className={styles.historyBar}>
        <button
          className={styles.primaryAction}
          onClick={() =>
            open({
              ...newCut(crypto.randomUUID()),
              name: `Cut ${doc.cuts.length + 1}`,
            })
          }
          disabled={doc.cuts.length >= 12 || !!draft}
        >
          New cut
        </button>
        <button
          onClick={() => history("undo")}
          disabled={!past.length && !undoCount}
        >
          Undo cut
        </button>
        <button
          onClick={() => history("redo")}
          disabled={!future.length && !redoCount}
        >
          Redo cut
        </button>
      </div>
      {doc.cuts.length > 0 && (
        <ul className={styles.cutList} aria-label="Applied cuts">
          {doc.cuts.map((cut) => (
            <li key={cut.id}>
              <label>
                <input
                  type="checkbox"
                  checked={cut.enabled}
                  onChange={(e) => {
                    onPreview(null);
                    onApply(
                      doc.cuts.map((c) =>
                        c.id === cut.id
                          ? { ...c, enabled: e.target.checked }
                          : c,
                      ),
                    );
                  }}
                />{" "}
                {cut.name}
              </label>
              <button
                aria-label={`Edit ${cut.name}`}
                disabled={!!draft}
                onClick={() => open(cut)}
              >
                Edit
              </button>
              <button
                aria-label={`Delete ${cut.name}`}
                disabled={!!draft}
                onClick={() => {
                  onPreview(null);
                  onApply(doc.cuts.filter((c) => c.id !== cut.id));
                  if (draft?.id === cut.id) setDraft(null);
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      {draft ? (
        <>
          <label className={styles.field}>
            Cut from
            <select
              aria-label="View from"
              value={draft.edge}
              onChange={(e) =>
                edit({
                  ...draft,
                  edge: e.target.value as CutEdge,
                  anchor: null,
                })
              }
            >
              {(["top", "right", "bottom", "left"] as const).map((side) => (
                <option key={side} value={side}>
                  {side[0].toUpperCase() + side.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <details className={styles.cutOptions}>
            <summary>
              Cut settings <span>Across the whole side</span>
            </summary>
            <label className={styles.field}>
              Cut name
              <input
                value={draft.name}
                maxLength={60}
                onChange={(e) => edit({ ...draft, name: e.target.value })}
              />
            </label>
            <label className={styles.slider}>
              Move cut up / down{" "}
              <span>
                {heightOffset > 0 ? "+" : ""}
                {heightOffset.toFixed(1)} mm
              </span>
              <input
                aria-label="Cut height offset"
                type="range"
                min={-parameters.depth}
                max={parameters.depth}
                step={0.5}
                value={heightOffset}
                onChange={(e) =>
                  edit({
                    ...brushDraft(draft),
                    heightOffset: e.target.valueAsNumber,
                  })
                }
              />
            </label>
            <label className="lab-toggle">
              <input
                type="checkbox"
                checked={draft.edgeSmoothing == null}
                onChange={(e) =>
                  edit({
                    ...brushDraft(draft),
                    edgeSmoothing: e.target.checked ? null : 1,
                  })
                }
              />
              Smooth painted outline automatically
            </label>
            {draft.edgeSmoothing != null && (
              <label className={styles.slider}>
                Outline smoothing{" "}
                <span>{draft.edgeSmoothing.toFixed(1)} mm</span>
                <input
                  aria-label="Cut edge smoothing"
                  type="range"
                  min={0.1}
                  max={5}
                  step={0.1}
                  value={draft.edgeSmoothing}
                  onChange={(e) =>
                    edit({
                      ...brushDraft(draft),
                      edgeSmoothing: e.target.valueAsNumber,
                    })
                  }
                />
              </label>
            )}
            <p className={styles.hint}>
              Softens small bumps in your painted outline.
            </p>
            <div className={styles.historyBar}>
              <button
                onClick={() =>
                  edit({
                    ...draft,
                    heightOffset: 0,
                    edgeSmoothing: null,
                    blendEnds: false,
                    blendRims: false,
                    insideRadius: 0,
                    outsideRadius: 0,
                  })
                }
              >
                Reset cut adjustments
              </button>
            </div>
          </details>
          <div
            className={styles.toolbar}
            role="group"
            aria-label="Cut painting tools"
          >
            <button
              aria-pressed={tool === "draw"}
              onClick={() => setTool("draw")}
            >
              Paint cut
            </button>
            <button
              aria-pressed={tool === "erase"}
              onClick={() => setTool("erase")}
            >
              Erase
            </button>
            <button
              aria-pressed={tool === "smooth"}
              onClick={() => setTool("smooth")}
            >
              Smooth brush
            </button>
          </div>
          <BrushSizeControl
            label="Cut brush diameter"
            value={brushSize}
            onChange={setBrushSize}
          />
          <div className={styles.historyBar}>
            <button
              onClick={() =>
                edit({
                  ...draft,
                  profile: Array(33).fill(0),
                  paint: draft.paint
                    ? {
                        ...draft.paint,
                        material: draft.paint.material.map(() => 0),
                      }
                    : undefined,
                })
              }
            >
              Reset cut
            </button>
          </div>
          {tool === "smooth" && (
            <label className={styles.slider}>
              Smooth strength <span>{Math.round(smoothStrength * 100)}%</span>
              <input
                aria-label="Cut smooth strength"
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={smoothStrength}
                onChange={(e) => setSmoothStrength(+e.target.value)}
              />
            </label>
          )}
          <p className={styles.toolHint}>
            {tool === "smooth"
              ? "Brush along the red edge to soften bumps and fill small notches."
              : tool === "erase"
                ? "Brush over red areas to bring that material back."
                : "Paint rose over the lavender shape to carve material away."}
          </p>
          <canvas
            ref={canvas}
            width={640}
            height={420}
            className={styles.profileCanvas}
            aria-label="Draw cut profile cross-section"
            onPointerDown={(e) => {
              if (e.button !== 0 || !reference) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              const p = point(e);
              setCursor(p);
              const next = applyBrush(draft, p, p);
              gesture.current = {
                before: cloneCut(draft),
                point: p,
                current: next,
              };
              setDraft(next);
              props.onPreviewPending();
            }}
            onPointerMove={(e) => {
              const p = point(e);
              setCursor(p);
              const g = gesture.current;
              if (!g) return;
              g.current = applyBrush(g.current, g.point, p);
              g.point = p;
              setDraft(g.current);
            }}
            onPointerUp={finish}
            onPointerCancel={finish}
            onLostPointerCapture={finish}
            onPointerLeave={() => {
              if (!gesture.current) setCursor(null);
            }}
          />
          <p className={styles.hint}>
            <span className={styles.blueKey}>Lavender: your hold</span> ·{" "}
            <span className={styles.cutKey}>Rose: cut away</span> · Dashed:
            screw holes
          </p>
          <p className={styles.hint}>
            Paint past the edges for a clean cut. The preview updates
            automatically.
          </p>
          <p role="status">{message}</p>
          {props.previewError && (
            <p role="alert" className={styles.cutError}>
              {props.previewError}
            </p>
          )}
          <div className={styles.cutActions}>
            <button
              className={styles.primaryAction}
              disabled={
                !reference ||
                (!hasCut && !doc.cuts.some((c) => c.id === draft.id)) ||
                (hasCut && props.previewReadyId !== draft.id)
              }
              onClick={() => {
                const cut = confirmed();
                if (!cut) return;
                onPreview(null);
                onApply([...doc.cuts.filter((c) => c.id !== cut.id), cut]);
                setDraft(null);
                setPast([]);
                setFuture([]);
              }}
            >
              Apply cut
            </button>
            <button
              onClick={() => {
                setDraft(null);
                onPreview(null);
                setPast([]);
                setFuture([]);
              }}
            >
              Cancel edit
            </button>
          </div>
          {hasCut && !props.previewError && (
            <p className={styles.hint} role="status">
              {props.previewReadyId === draft.id
                ? "Ready to apply. Your cut will be included in the STL."
                : "Updating your cut…"}
            </p>
          )}
        </>
      ) : (
        <div className={styles.emptyState}>
          <h3>{doc.cuts.length ? "Keep shaping" : "Make your first cut"}</h3>
          <p>
            Choose New cut, pick a side, and paint where you want to carve.
            Apply it when the shape looks right.
          </p>
        </div>
      )}
    </section>
  );
}
