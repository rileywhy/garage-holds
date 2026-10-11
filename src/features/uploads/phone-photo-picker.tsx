"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Smartphone, X } from "lucide-react";
import { FieldErrors } from "@/components/form-fields";
import { formatBytes } from "@/features/holds/catalog";
import { QrCode } from "./qr-code";
import {
  listPhonePhotos,
  startPhoneSession,
  type PhonePhoto,
} from "./phone-actions";

const POLL_MS = 3000;

// "Add photos from your phone": starts a session, shows its link as a QR
// code, and polls for photos until the code expires. Arrived photos are
// selected by default; the parent decides what to do with the selection.
export function PhonePhotoPicker({
  designId,
  selected,
  onChange,
  disabled = false,
}: {
  designId?: string;
  selected: PhonePhoto[];
  onChange: (photos: PhonePhoto[]) => void;
  disabled?: boolean;
}) {
  const [session, setSession] = useState<{
    id: string;
    url: string;
    expiresAt: number;
  } | null>(null);
  const [arrived, setArrived] = useState<PhonePhoto[]>([]);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [expired, setExpired] = useState(false);
  const known = useRef(new Set<string>());

  async function start() {
    setStarting(true);
    setError("");
    const result = await startPhoneSession(designId);
    setStarting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    known.current = new Set();
    setArrived([]);
    setExpired(false);
    setSession({
      id: result.sessionId,
      url: result.url,
      expiresAt: Date.parse(result.expiresAt),
    });
  }

  useEffect(() => {
    if (!session || expired) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      if (Date.now() > session.expiresAt) {
        setExpired(true);
        return;
      }
      const photos = await listPhonePhotos(session.id);
      if (cancelled) return;
      setArrived(photos);
      const fresh = photos.filter((photo) => !known.current.has(photo.id));
      if (fresh.length) {
        for (const photo of fresh) known.current.add(photo.id);
        onChange([...selected, ...fresh]);
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // `selected` is read when photos arrive; re-subscribing on every change
    // would reset the timer each poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, expired, onChange]);

  const selectedIds = new Set(selected.map((photo) => photo.id));

  return (
    <div className="phone-handoff">
      {!session ? (
        <button
          type="button"
          className="button button-outline"
          disabled={disabled || starting}
          onClick={start}
        >
          {starting ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <Smartphone size={16} />
          )}{" "}
          Add photos from your phone
        </button>
      ) : (
        <div className="phone-handoff-panel">
          <div className="phone-handoff-code">
            <QrCode
              value={session.url}
              label="Scan to add photos from your phone"
            />
          </div>
          <div className="phone-handoff-text">
            <strong>Scan with your phone’s camera.</strong>
            <p>
              It opens a page where you can take a photo or choose one from your
              library. Photos show up here as they upload.
            </p>
            <p className="small-note">
              {expired
                ? "This code has expired."
                : `The code works for 15 minutes. Waiting for photos…`}
            </p>
            {expired && (
              <button
                type="button"
                className="button button-outline"
                disabled={disabled || starting}
                onClick={start}
              >
                New code
              </button>
            )}
          </div>
        </div>
      )}
      <FieldErrors errors={error ? [error] : []} />
      {arrived.length > 0 && (
        <ul className="photo-previews phone-photos">
          {arrived.map((photo) => {
            const included = selectedIds.has(photo.id);
            return (
              <li key={photo.id} className={included ? "" : "excluded"}>
                <img src={photo.url} alt={`Phone photo ${photo.name}`} />
                <span>
                  <strong title={photo.name}>{photo.name}</strong>
                  <small>
                    {formatBytes(photo.bytes)} · from your phone
                    {included ? "" : " · not included"}
                  </small>
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={
                    included
                      ? `Leave out ${photo.name}`
                      : `Include ${photo.name}`
                  }
                  aria-pressed={included}
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      included
                        ? selected.filter((item) => item.id !== photo.id)
                        : [...selected, photo],
                    )
                  }
                >
                  {included ? <X size={15} /> : <PlusIcon />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
