"use client";

import { useState } from "react";
import { Box } from "lucide-react";
import { previewModel } from "@/components/hold-art";
import { PhotoImage } from "@/components/photo-image";
import { StlViewer } from "./stl-viewer";
import type { Hold } from "./types";

// The design page's photos and 3D preview: one large view, with thumbnails
// for every photo and a tile for the model that swap it in. The large photo
// shows whole and links to the original.
export function PhotoGallery({ hold }: { hold: Hold }) {
  const model = previewModel(hold);
  const [selected, setSelected] = useState<number | "model">(0);
  const photo =
    selected === "model" ? null : (hold.photos[selected] ?? hold.photos[0]);
  const index = photo ? hold.photos.indexOf(photo) : 0;
  return (
    <>
      <div className="detail-main-visual">
        {photo ? (
          <a
            href={photo.url}
            target="_blank"
            rel="noreferrer"
            className="detail-photo-link"
            aria-label={`Open photo ${index + 1} of ${hold.photos.length} at full size`}
          >
            <PhotoImage
              key={photo.id}
              src={photo.largeUrl}
              fallback={photo.url}
              alt={`${hold.title}, photo ${index + 1} of ${hold.photos.length}`}
              className="hold-photo"
            />
          </a>
        ) : (
          model && <StlViewer file={model} title={hold.title} />
        )}
      </div>
      {(hold.photos.length > 1 || model) && (
        <div className="detail-extra-photos" role="group" aria-label="Views">
          {hold.photos.map((item, position) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={position === selected}
              aria-label={`Show photo ${position + 1}`}
              onClick={() => setSelected(position)}
            >
              <PhotoImage src={item.cardUrl} fallback={item.url} alt="" />
            </button>
          ))}
          {model && (
            <button
              type="button"
              className="detail-model-tile"
              aria-pressed={selected === "model"}
              onClick={() => setSelected("model")}
            >
              <Box size={22} strokeWidth={1.4} aria-hidden="true" />
              <span>3D preview</span>
            </button>
          )}
        </div>
      )}
    </>
  );
}
