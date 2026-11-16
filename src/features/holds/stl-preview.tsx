"use client";

import { useEffect, useRef, useState } from "react";
import { FileBox } from "lucide-react";
import { getStlThumbnail } from "./stl-thumbnail";
import type { Orientation } from "./orientation";

// A card's one-off side view of the uploaded model, rendered to an image
// once it scrolls near. The design page shows the interactive viewer instead
// (stl-viewer.tsx).
export function StlPreview({
  file,
  title,
  color,
}: {
  file: { id: string; url: string; orientation: Orientation };
  title: string;
  color: string;
}) {
  const { id: fileId, url, orientation } = file;
  const container = useRef<HTMLDivElement>(null);
  // The render result is tagged with what it was made for, so a changed
  // file or orientation reads as "loading" without resetting state in the
  // effect.
  const key = `${fileId}:${orientation}:${color}`;
  const [rendered, setRendered] = useState<{
    key: string;
    image: HTMLCanvasElement | null;
    failed: boolean;
  }>({ key: "", image: null, failed: false });
  useEffect(() => {
    let active = true;
    const load = () => {
      getStlThumbnail({ id: fileId, url, orientation }, color)
        .then((image) => {
          if (active) setRendered({ key, image, failed: false });
        })
        .catch(() => {
          if (active) setRendered({ key, image: null, failed: true });
        });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: "200px" },
    );
    if (container.current) observer.observe(container.current);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [fileId, url, orientation, color, key]);
  const { image, failed } =
    rendered.key === key ? rendered : { image: null, failed: false };
  // The thumbnail is drawn onto this card's own canvas; see stl-renderer.ts
  // for why it is not an <img>.
  const picture = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (image) picture.current?.getContext("2d")?.drawImage(image, 0, 0);
  }, [image]);
  return (
    <div className="stl-preview" ref={container}>
      <div className="stl-preview-canvas" aria-busy={!image && !failed}>
        {image ? (
          <>
            <canvas
              ref={picture}
              width={image.width}
              height={image.height}
              role="img"
              aria-label={`STL preview of ${title}, side view`}
              className="stl-preview-image"
            />
            <span className="illustration-label">STL preview</span>
          </>
        ) : (
          <div className="image-placeholder no-photo-visual">
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
    </div>
  );
}
