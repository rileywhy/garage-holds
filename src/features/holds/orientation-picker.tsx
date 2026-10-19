"use client";

import { useEffect, useRef, useState } from "react";
import { FileBox, X } from "lucide-react";
import { VIEWER_CONTROLS } from "@/features/model-viewer/gestures";
import { useModelViewer, type ModelSource } from "./use-model-viewer";
import {
  DEFAULT_ORIENTATION,
  moveOrientation,
  type Move,
  type Orientation,
} from "./orientation";

const MOVES: { id: Move; label: string }[] = [
  { id: "flip", label: "Flip over" },
  { id: "tip", label: "Tip forward" },
  { id: "roll", label: "Roll sideways" },
  { id: "turn", label: "Turn" },
];

// The model on a 40° board with four ways to turn it, so a file that came
// in upside down or on its side can be set the way it mounts. The file is
// never changed; only how the site shows it.
export function OrientationPicker({
  source,
  value,
  onChange,
  color,
}: {
  source: ModelSource;
  value: Orientation;
  onChange: (orientation: Orientation) => void;
  color: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const { ready, failed } = useModelViewer(container, source, {
    orientation: value,
    color,
    view: "board",
    turning: false,
  });
  return (
    <div className="stl-preview stl-viewer orientation-picker">
      <div className="stl-preview-canvas" aria-busy={!ready && !failed}>
        <div
          ref={container}
          className="stl-viewer-canvas"
          role="img"
          aria-label={`The model on a 40° board. ${VIEWER_CONTROLS}`}
          hidden={failed}
        />
        {ready ? (
          <span className="illustration-label">
            On a 40° board · drag to look around
          </span>
        ) : (
          <div className="image-placeholder no-photo-visual stl-viewer-note">
            <FileBox size={32} aria-hidden="true" />
            <span>
              {failed ? "This model can't be previewed" : "Loading the model…"}
            </span>
            <small>
              {failed
                ? "Only STL files can be turned here."
                : "Only how the site shows it changes; the file stays as it is."}
            </small>
          </div>
        )}
      </div>
      {ready && (
        <div
          className="stl-preview-angles"
          role="group"
          aria-label="Turn the model"
        >
          {MOVES.map((move) => (
            <button
              key={move.id}
              type="button"
              onClick={() => onChange(moveOrientation(value, move.id))}
            >
              {move.label}
            </button>
          ))}
          <button
            type="button"
            disabled={value === DEFAULT_ORIENTATION}
            onClick={() => onChange(DEFAULT_ORIENTATION)}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

// The picker in a modal, for the upload and edit pages. Apply reports the
// orientation; the caller stores it.
export function OrientationDialog({
  source,
  name,
  value,
  color,
  onApply,
  onCancel,
}: {
  source: ModelSource;
  name: string;
  value: Orientation;
  color: string;
  onApply: (orientation: Orientation) => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [orientation, setOrientation] = useState(value);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="crop-dialog orientation-dialog"
      aria-labelledby="orientation-heading"
      onClose={onCancel}
    >
      <div className="feedback-dialog-head">
        <h2 id="orientation-heading">Orientation of {name}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close without changing the orientation"
          onClick={onCancel}
        >
          <X size={16} />
        </button>
      </div>
      <p className="small-note">
        Turn the model until its flat back sits on the board and the grip faces
        the way it mounts. Previews and the 3D view follow; the file itself is
        not changed.
      </p>
      <div className="orientation-stage">
        <OrientationPicker
          source={source}
          value={orientation}
          onChange={setOrientation}
          color={color}
        />
      </div>
      <div className="crop-actions">
        <button
          type="button"
          className="button button-outline crop-actions-end"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="button button-dark"
          onClick={() => onApply(orientation)}
        >
          Use this orientation
        </button>
      </div>
    </dialog>
  );
}
