"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { X } from "lucide-react";
import { centeredBox, MIN_CROP_PIXELS, type CropRect } from "./crop";

const CARD_ASPECT = 4 / 3;
type Handle = "move" | "nw" | "ne" | "sw" | "se";

// A modal with the photo and one draggable box over it. The box is kept in
// image pixels; the stage scales the photo to fit, so pointer movement is
// divided by that scale. Apply reports the box; the caller does the crop.
export function PhotoCropper({
  source,
  name,
  onApply,
  onCancel,
}: {
  source: File | string;
  name: string;
  onApply: (rect: CropRect) => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const url = useMemo(
    () => (typeof source === "string" ? source : URL.createObjectURL(source)),
    [source],
  );
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [scale, setScale] = useState(1);
  const [box, setBox] = useState<CropRect | null>(null);
  const drag = useRef<{
    handle: Handle;
    x: number;
    y: number;
    start: CropRect;
  } | null>(null);

  useEffect(
    () => () => {
      if (typeof source !== "string") URL.revokeObjectURL(url);
    },
    [source, url],
  );

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  // The displayed size follows the viewport; the box stays in image pixels.
  useEffect(() => {
    const element = image.current;
    if (!element || !size) return;
    const observer = new ResizeObserver(() =>
      setScale(element.clientWidth / size.width || 1),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [size]);

  function loaded() {
    const element = image.current;
    if (!element) return;
    const natural = {
      width: element.naturalWidth,
      height: element.naturalHeight,
    };
    setSize(natural);
    setBox(centeredBox(natural.width, natural.height, CARD_ASPECT));
  }

  function begin(event: PointerEvent<HTMLDivElement>) {
    if (!box) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      handle: (event.currentTarget.dataset.handle ?? "move") as Handle,
      x: event.clientX,
      y: event.clientY,
      start: box,
    };
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || !size) return;
    const dx = (event.clientX - current.x) / scale;
    const dy = (event.clientY - current.y) / scale;
    const { start } = current;
    const clamp = (value: number, min: number, max: number) =>
      Math.min(Math.max(value, min), max);
    if (current.handle === "move") {
      setBox({
        ...start,
        left: clamp(start.left + dx, 0, size.width - start.width),
        top: clamp(start.top + dy, 0, size.height - start.height),
      });
      return;
    }
    const right = start.left + start.width;
    const bottom = start.top + start.height;
    const west = current.handle === "nw" || current.handle === "sw";
    const north = current.handle === "nw" || current.handle === "ne";
    const left = west
      ? clamp(start.left + dx, 0, right - MIN_CROP_PIXELS)
      : start.left;
    const top = north
      ? clamp(start.top + dy, 0, bottom - MIN_CROP_PIXELS)
      : start.top;
    const newRight = west
      ? right
      : clamp(right + dx, start.left + MIN_CROP_PIXELS, size.width);
    const newBottom = north
      ? bottom
      : clamp(bottom + dy, start.top + MIN_CROP_PIXELS, size.height);
    setBox({
      left,
      top,
      width: newRight - left,
      height: newBottom - top,
    });
  }

  function end() {
    drag.current = null;
  }

  const px = (value: number) => `${value * scale}px`;
  return (
    <dialog
      ref={dialog}
      className="crop-dialog"
      aria-labelledby="crop-heading"
      onClose={onCancel}
    >
      <div className="feedback-dialog-head">
        <h2 id="crop-heading">Crop {name}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close without cropping"
          onClick={onCancel}
        >
          <X size={16} />
        </button>
      </div>
      <p className="small-note">
        Drag the box to move it, or its corners to resize. Cards in the pile
        show a 4:3 crop; the design page shows the whole photo.
      </p>
      <div className="crop-stage">
        <img ref={image} src={url} alt="" onLoad={loaded} draggable={false} />
        {box && size && (
          <div
            className="crop-box"
            role="presentation"
            style={{
              left: px(box.left),
              top: px(box.top),
              width: px(box.width),
              height: px(box.height),
            }}
            data-handle="move"
            onPointerDown={begin}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          >
            {(["nw", "ne", "sw", "se"] as const).map((handle) => (
              <div
                key={handle}
                className={`crop-handle crop-handle-${handle}`}
                data-handle={handle}
                onPointerDown={begin}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
              />
            ))}
          </div>
        )}
      </div>
      <div className="crop-actions">
        <button
          type="button"
          className="button button-outline"
          disabled={!size}
          onClick={() =>
            size && setBox(centeredBox(size.width, size.height, CARD_ASPECT))
          }
        >
          Card shape (4:3)
        </button>
        <button
          type="button"
          className="button button-outline"
          disabled={!size}
          onClick={() => size && setBox({ left: 0, top: 0, ...size })}
        >
          Whole photo
        </button>
        <span className="crop-actions-end" />
        <button
          type="button"
          className="button button-outline"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="button button-dark"
          disabled={!box}
          onClick={() => box && onApply(box)}
        >
          Apply crop
        </button>
      </div>
    </dialog>
  );
}
