"use client";

import { useEffect, useRef, useState } from "react";
import { FileBox } from "lucide-react";
import { getStlThumbnail } from "./stl-thumbnail";

// A card's one-off side view of the uploaded model, rendered to an image
// once it scrolls near. The design page shows the interactive viewer instead
// (stl-viewer.tsx).
export function StlPreview({
  file,
  title,
}: {
  file: { id: string; url: string };
  title: string;
}) {
  const { id: fileId, url } = file;
  const container = useRef<HTMLDivElement>(null);
  // The render result is tagged with the file it was made for, so a changed
  // file reads as "loading" without resetting state in the effect.
  const [rendered, setRendered] = useState({
    fileId: "",
    image: "",
    failed: false,
  });
  useEffect(() => {
    let active = true;
    const load = () => {
      getStlThumbnail({ id: fileId, url })
        .then((image) => {
          if (active) setRendered({ fileId, image, failed: false });
        })
        .catch(() => {
          if (active) setRendered({ fileId, image: "", failed: true });
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
  }, [fileId, url]);
  const { image, failed } =
    rendered.fileId === fileId ? rendered : { image: "", failed: false };
  return (
    <div className="stl-preview" ref={container}>
      <div className="stl-preview-canvas" aria-busy={!image && !failed}>
        {image ? (
          <>
            <img
              src={image}
              alt={`STL preview of ${title}, side view`}
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
