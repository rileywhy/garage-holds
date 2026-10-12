"use client";

import { useEffect, useRef, useState } from "react";
import { FileBox } from "lucide-react";
import type { Viewer, ViewName } from "@/features/model-viewer/viewer";
import {
  DEFAULT_BOARD_ANGLE,
  MAX_BOARD_ANGLE,
} from "@/features/model-viewer/board-preview";
import { MAX_STL_PREVIEW_BYTES } from "./stl-limits";

// The design page's model view: the uploaded STL turning slowly on a print
// bed until the reader takes hold of it, with fixed angles and a mounted-on-
// a-board option. Cards keep their one-off thumbnails (stl-preview.tsx).

const VIEWS: { id: ViewName; label: string }[] = [
  { id: "three-quarter", label: "Spin" },
  { id: "side", label: "Side" },
  { id: "front", label: "Front" },
  { id: "top", label: "Top" },
  { id: "board", label: "On a board" },
];

export function StlViewer({
  file,
  title,
}: {
  file: { id: string; url: string };
  title: string;
}) {
  const { id: fileId, url } = file;
  const container = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  // Tagged with the file it was loaded for, so a changed file reads as
  // "loading" without resetting state inside the effect.
  const [loaded, setLoaded] = useState({ fileId: "", failed: false });
  const [view, setView] = useState<ViewName>("three-quarter");
  const [boardAngle, setBoardAngle] = useState(DEFAULT_BOARD_ANGLE);

  useEffect(() => {
    const box = container.current;
    if (!box) return;
    let active = true;
    let created: Viewer | null = null;
    (async () => {
      const [{ Viewer, isDarkTheme }, { holdGeometry }, response] =
        await Promise.all([
          import("@/features/model-viewer/viewer"),
          import("./stl-scene"),
          fetch(url),
        ]);
      if (!response.ok) throw new Error("Could not load this STL.");
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > MAX_STL_PREVIEW_BYTES)
        throw new Error("This STL is too large for a browsing preview.");
      const geometry = holdGeometry(bytes);
      if (!active) {
        geometry.dispose();
        return;
      }
      created = new Viewer(box, { dark: isDarkTheme(), color: 0x9aa883 });
      created.setGeometry(geometry);
      created.setTurning(true);
      viewer.current = created;
      setLoaded({ fileId, failed: false });
    })().catch(() => {
      if (active) setLoaded({ fileId, failed: true });
    });
    return () => {
      active = false;
      viewer.current = null;
      created?.dispose();
    };
  }, [fileId, url]);

  const ready = loaded.fileId === fileId && !loaded.failed;
  const failed = loaded.fileId === fileId && loaded.failed;

  const choose = (name: ViewName) => {
    setView(name);
    viewer.current?.setView(name);
    viewer.current?.setTurning(name === "three-quarter");
  };
  const tilt = (angle: number) => {
    if (!Number.isFinite(angle)) return;
    const clamped = Math.min(MAX_BOARD_ANGLE, Math.max(0, Math.round(angle)));
    setBoardAngle(clamped);
    viewer.current?.setBoardAngle(clamped);
  };

  return (
    <div className="stl-preview stl-viewer">
      <div className="stl-preview-canvas" aria-busy={!ready && !failed}>
        <div
          ref={container}
          className="stl-viewer-canvas"
          role="img"
          aria-label={`Interactive 3D preview of ${title}. Drag to rotate; scroll to zoom.`}
          hidden={failed}
        />
        {ready ? (
          <span className="illustration-label">
            {view === "board"
              ? `On a ${boardAngle}° board · drag to rotate`
              : "STL preview · drag to rotate"}
          </span>
        ) : (
          <div className="image-placeholder no-photo-visual stl-viewer-note">
            <FileBox size={32} aria-hidden="true" />
            <span>
              {failed ? "STL preview unavailable" : "Preparing STL preview…"}
            </span>
            <small>
              {failed
                ? "Original model files are still available."
                : "A simple view of the uploaded model"}
            </small>
          </div>
        )}
      </div>
      {ready && (
        <div className="stl-preview-angles" role="group" aria-label="3D view">
          {VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={view === option.id}
              onClick={() => choose(option.id)}
            >
              {option.label}
            </button>
          ))}
          {view === "board" && (
            <label className="stl-viewer-angle">
              <span>Board {boardAngle}°</span>
              <input
                type="range"
                min={0}
                max={MAX_BOARD_ANGLE}
                step={1}
                value={boardAngle}
                aria-label="Board angle from vertical"
                onChange={(event) => tilt(event.target.valueAsNumber)}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
