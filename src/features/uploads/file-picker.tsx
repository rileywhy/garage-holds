"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { FileBox, ImagePlus, UploadCloud, X } from "lucide-react";
import { FieldErrors } from "@/components/form-fields";
import { formatBytes } from "@/features/holds/catalog";
import { cropFile } from "./crop-file";
import { PhotoCropper } from "./photo-cropper";

// Tells chosen files apart before they have ids.
export function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function PhotoThumbnail({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt={`Preview of ${file.name}`} />;
}

export function FilePicker({
  kind,
  files,
  onChange,
  accept,
  disabled = false,
  compact = false,
  fileAction,
}: {
  kind: "photos" | "models";
  files: File[];
  onChange: (files: File[]) => void;
  accept: string;
  disabled?: boolean;
  // Adding to an existing design: shorter copy, no first-photo plea.
  compact?: boolean;
  // An extra control beside a file, such as the orientation of a model.
  fileAction?: (file: File) => ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  // Index of the photo open in the cropper, if any. Cropping is optional
  // and tucked behind a small link; most photos go up untouched.
  const [cropping, setCropping] = useState<number | null>(null);
  const [cropError, setCropError] = useState("");
  const inputId = useId();
  const photos = kind === "photos";
  const key = fileKey;
  function add(incoming: File[]) {
    if (disabled) return;
    const known = new Set(files.map(key));
    onChange([
      ...files,
      ...incoming.filter((file) => {
        const id = key(file);
        if (known.has(id)) return false;
        known.add(id);
        return true;
      }),
    ]);
  }
  return (
    <div className="file-picker">
      <label
        htmlFor={inputId}
        className={`dropzone ${dragging ? "dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          add(Array.from(event.dataTransfer.files));
        }}
      >
        <input
          id={inputId}
          className="sr-only"
          type="file"
          disabled={disabled}
          multiple
          accept={accept}
          aria-label={photos ? "Choose hold photos" : "Choose model files"}
          onChange={(event) => {
            add(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        {photos ? (
          <ImagePlus size={27} strokeWidth={1.4} />
        ) : (
          <UploadCloud size={27} strokeWidth={1.4} />
        )}
        <strong>
          {photos
            ? compact
              ? "Add photos from this computer"
              : "Add photos (optional, but appreciated!)"
            : "Drop your model files here"}
        </strong>
        <span>
          Drag and drop, or <u>browse files</u>
        </span>
        <small>
          {photos
            ? "JPG, PNG, WebP · up to 6 photos · 10 MB each"
            : "STL, 3MF, STEP, OBJ + more · up to 10 files · 100 MB each"}
        </small>
      </label>
      {photos && !compact && files.length === 0 && (
        <p className="photo-picker-hint">
          Please add a photo if you have one. We’d really appreciate it—photos
          make the feel and texture easier to understand.
        </p>
      )}
      {files.length > 0 && (
        <ul className={photos ? "photo-previews" : "file-list"}>
          {files.map((file, index) => (
            <li key={key(file)}>
              {photos && file.type.startsWith("image/") ? (
                <PhotoThumbnail file={file} />
              ) : (
                <FileBox size={21} />
              )}
              <span>
                <strong title={file.name}>{file.name}</strong>
                <small>
                  {formatBytes(file.size)}
                  {photos && !compact && index === 0 ? " · Cover photo" : ""}
                </small>
              </span>
              {photos && file.type.startsWith("image/") && (
                <button
                  type="button"
                  className="text-button"
                  disabled={disabled}
                  onClick={() => {
                    setCropError("");
                    setCropping(index);
                  }}
                >
                  Crop
                </button>
              )}
              {fileAction?.(file)}
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${file.name}`}
                onClick={() =>
                  onChange(files.filter((_, position) => position !== index))
                }
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <FieldErrors errors={cropError ? [cropError] : []} />
      {cropping !== null && files[cropping] && (
        <PhotoCropper
          source={files[cropping]}
          name={files[cropping].name}
          onCancel={() => setCropping(null)}
          onApply={async (rect) => {
            const index = cropping;
            setCropping(null);
            try {
              const cropped = await cropFile(files[index], rect);
              onChange(
                files.map((file, position) =>
                  position === index ? cropped : file,
                ),
              );
            } catch (error) {
              setCropError((error as Error).message);
            }
          }}
        />
      )}
    </div>
  );
}
