"use client";

import { useEffect, useRef, useState } from "react";
import { FileBox } from "lucide-react";
import { getStlThumbnail } from "./stl-thumbnail";
import { STL_VIEWS, type StlView } from "./stl-views";

export function StlPreview({
  fileId,
  title,
  showAngles = false,
}: {
  fileId: string;
  title: string;
  showAngles?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState("");
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<StlView>("side");
  useEffect(() => {
    let active = true;
    setImage("");
    setFailed(false);
    const load = () => {
      getStlThumbnail(fileId, view)
        .then((url) => {
          if (active) setImage(url);
        })
        .catch(() => {
          if (active) setFailed(true);
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
  }, [fileId, view]);
  const label = STL_VIEWS.find((option) => option.id === view)!.label;
  return (
    <div className="stl-preview" ref={container}>
      <div className="stl-preview-canvas" aria-busy={!image && !failed}>
        {image ? (
          <>
            <img
              src={image}
              alt={`STL preview of ${title}, ${label.toLowerCase()} view`}
              className="stl-preview-image"
            />
            <span className="illustration-label">STL preview · {label}</span>
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
      {showAngles && (
        <div
          className="stl-preview-angles"
          role="group"
          aria-label="STL preview angle"
        >
          {STL_VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-label={`Show ${option.label.toLowerCase()} view`}
              aria-pressed={view === option.id}
              onClick={() => setView(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
