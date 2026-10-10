"use client";

import { useEffect, useId, useState } from "react";
import { FileBox, ImagePlus, UploadCloud, X } from "lucide-react";
import { formatBytes } from "@/features/holds/catalog";

function PhotoThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url ? <img src={url} alt={`Preview of ${file.name}`} /> : null;
}

export function FilePicker({
  kind,
  files,
  onChange,
  accept,
  disabled = false,
}: {
  kind: "photos" | "models";
  files: File[];
  onChange: (files: File[]) => void;
  accept: string;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputId = useId();
  const photos = kind === "photos";
  const key = (file: File) => `${file.name}-${file.size}-${file.lastModified}`;
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
            ? "Add photos (optional, but appreciated!)"
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
      {photos && files.length === 0 && (
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
                  {photos && index === 0 ? " · Cover photo" : ""}
                </small>
              </span>
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
    </div>
  );
}
