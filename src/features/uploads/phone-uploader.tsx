"use client";

import { useRef, useState } from "react";
import { Camera, CircleCheck, ImagePlus, LoaderCircle } from "lucide-react";
import { formatBytes } from "@/features/holds/catalog";
import { confirmPhonePhoto, signPhonePhoto } from "./phone-actions";

type Status = "uploading" | "done" | "failed";

interface Item {
  key: string;
  name: string;
  bytes: number;
  status: Status;
  message?: string;
}

// The page a phone lands on after scanning the code: take a photo or pick
// one, and it goes straight to storage. No account needed; the session id
// in the URL is the only credential, and the server checks it every time.
export function PhoneUploader({ sessionId }: { sessionId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const busy = items.some((item) => item.status === "uploading");

  function update(key: string, patch: Partial<Item>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  async function upload(files: File[]) {
    for (const file of files) {
      const key = `${file.name}-${file.size}-${file.lastModified}-${Date.now()}`;
      setItems((current) => [
        ...current,
        { key, name: file.name, bytes: file.size, status: "uploading" },
      ]);
      try {
        const signed = await signPhonePhoto(sessionId, {
          name: file.name,
          bytes: file.size,
          type: file.type,
        });
        if ("error" in signed) {
          update(key, { status: "failed", message: signed.error });
          continue;
        }
        const response = await fetch(signed.url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": signed.contentType },
        });
        if (!response.ok) {
          update(key, {
            status: "failed",
            message: "The upload did not finish.",
          });
          continue;
        }
        const confirmed = await confirmPhonePhoto(sessionId, signed.photoId);
        if ("error" in confirmed) {
          update(key, { status: "failed", message: confirmed.error });
          continue;
        }
        update(key, { status: "done" });
      } catch {
        update(key, {
          status: "failed",
          message: "Check your connection and try again.",
        });
      }
    }
  }

  const accept = "image/jpeg,image/png,image/webp";
  return (
    <div className="phone-uploader">
      <input
        ref={cameraInput}
        className="sr-only"
        type="file"
        accept={accept}
        capture="environment"
        aria-label="Take a photo"
        onChange={(event) => {
          upload(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <input
        ref={libraryInput}
        className="sr-only"
        type="file"
        accept={accept}
        multiple
        aria-label="Choose photos from your library"
        onChange={(event) => {
          upload(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <div className="phone-uploader-actions">
        <button
          type="button"
          className="button button-dark"
          onClick={() => cameraInput.current?.click()}
        >
          <Camera size={18} /> Take a photo
        </button>
        <button
          type="button"
          className="button button-outline"
          onClick={() => libraryInput.current?.click()}
        >
          <ImagePlus size={18} /> Choose from library
        </button>
      </div>
      <p className="small-note">JPG, PNG, or WebP · up to 10 MB each.</p>
      {items.length > 0 && (
        <ul className="photo-previews" aria-live="polite">
          {items.map((item) => (
            <li key={item.key}>
              {item.status === "uploading" ? (
                <LoaderCircle size={21} className="spin" />
              ) : item.status === "done" ? (
                <CircleCheck size={21} />
              ) : (
                <ImagePlus size={21} />
              )}
              <span>
                <strong title={item.name}>{item.name}</strong>
                <small>
                  {formatBytes(item.bytes)} ·{" "}
                  {item.status === "uploading"
                    ? "uploading…"
                    : item.status === "done"
                      ? "on your computer now"
                      : item.message}
                </small>
              </span>
            </li>
          ))}
        </ul>
      )}
      {!busy && items.some((item) => item.status === "done") && (
        <p className="small-note">
          Done here. Go back to your computer to finish the design.
        </p>
      )}
    </div>
  );
}
