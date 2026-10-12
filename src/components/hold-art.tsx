"use client";

import type { Hold } from "@/features/holds/types";
import { FileBox } from "lucide-react";
import { StlPreview } from "@/features/holds/stl-preview";
import { StlViewer } from "@/features/holds/stl-viewer";
import { PhotoImage } from "./photo-image";

// The model file the browser can render, if any.
export function previewModel(hold: Hold) {
  return hold.files.find(
    (file) => file.extension.toLowerCase() === "stl" && file.url,
  );
}

// A photo by index, or the 3D preview when the index is past the photos
// (cards cycle through photos and then the model). The design page (large)
// gets the interactive viewer; cards get a one-off thumbnail.
export function HoldVisual({
  hold,
  large = false,
  photoIndex = 0,
}: {
  hold: Hold;
  large?: boolean;
  photoIndex?: number;
}) {
  const stl = previewModel(hold);
  const photo = hold.photos[photoIndex];
  return photo ? (
    <PhotoImage
      key={photo.id}
      src={large ? photo.largeUrl : photo.cardUrl}
      fallback={photo.url}
      alt={`${hold.title}, photo ${photoIndex + 1} of ${hold.photos.length}`}
      className="hold-photo"
    />
  ) : stl ? (
    large ? (
      <StlViewer file={stl} title={hold.title} color={hold.color} />
    ) : (
      <StlPreview file={stl} title={hold.title} color={hold.color} />
    )
  ) : (
    <div className="image-placeholder no-photo-visual">
      <FileBox size={32} aria-hidden="true" />
      <span>No photo yet</span>
      <small>Model files available · STL needed for a preview</small>
    </div>
  );
}
