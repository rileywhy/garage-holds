"use client";

import { useState } from "react";
import { PhotoImage } from "@/components/photo-image";
import type { Hold } from "./types";

// The design page's photos: one large, the rest as thumbnails that swap it
// in. The large view shows the whole photo; clicking it opens the original.
export function PhotoGallery({ hold }: { hold: Hold }) {
  const [index, setIndex] = useState(0);
  const photo = hold.photos[index] ?? hold.photos[0];
  return (
    <>
      <div className="detail-main-visual">
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
      </div>
      {hold.photos.length > 1 && (
        <div className="detail-extra-photos" role="group" aria-label="Photos">
          {hold.photos.map((item, position) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={position === index}
              aria-label={`Show photo ${position + 1}`}
              onClick={() => setIndex(position)}
            >
              <PhotoImage src={item.cardUrl} fallback={item.url} alt="" />
            </button>
          ))}
        </div>
      )}
    </>
  );
}
