"use client";

import { useRef, useState } from "react";
import { FileBox } from "lucide-react";
import type { ViewName } from "@/features/model-viewer/viewer";
import { VIEWER_CONTROLS } from "@/features/model-viewer/gestures";
import {
  DEFAULT_BOARD_ANGLE,
  MAX_BOARD_ANGLE,
} from "@/features/model-viewer/board-preview";
import { useModelViewer } from "./use-model-viewer";
import type { Orientation } from "./orientation";

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
  color,
}: {
  file: { id: string; url: string; orientation: Orientation };
  title: string;
  color: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewName>("three-quarter");
  const [boardAngle, setBoardAngle] = useState(DEFAULT_BOARD_ANGLE);
  const { viewer, ready, failed } = useModelViewer(
    container,
    { key: file.id, url: file.url },
    {
      orientation: file.orientation,
      color,
      view: "three-quarter",
      turning: true,
    },
  );

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
          aria-label={`Interactive 3D preview of ${title}. ${VIEWER_CONTROLS}`}
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
