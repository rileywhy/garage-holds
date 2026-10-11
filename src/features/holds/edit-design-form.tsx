"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, LoaderCircle, X } from "lucide-react";
import { FieldErrors } from "@/components/form-fields";
import { DesignFields } from "@/features/uploads/design-fields";
import { PhonePhotoPicker } from "@/features/uploads/phone-photo-picker";
import {
  attachPhonePhotos,
  type PhonePhoto,
} from "@/features/uploads/phone-actions";
import { removePhoto, updateDesign } from "./design-actions";
import type { Hold } from "./types";

export function EditDesignForm({ hold }: { hold: Hold }) {
  const [state, action, pending] = useActionState(
    updateDesign.bind(null, hold.id),
    { errors: [] },
  );
  return (
    <main className="main-container form-page">
      <Link href={`/holds/${hold.id}`} className="back-link">
        <ArrowLeft size={15} /> Back to {hold.title}
      </Link>
      <div className="page-intro">
        <p className="eyebrow">EDIT DESIGN</p>
        <h1>{hold.title}</h1>
        <p>
          Update the details other makers see. Files and publication state stay
          as they are.
        </p>
      </div>
      <form
        action={action}
        className="upload-form"
        aria-label="Edit design details"
        aria-busy={pending}
        noValidate
      >
        <fieldset className="upload-fields" disabled={pending}>
          <DesignFields defaults={hold} creator={hold.creator} />
        </fieldset>
        <div className="upload-errors" aria-label="Edit errors">
          <FieldErrors errors={state.errors} />
        </div>
        <PhotoSection hold={hold} />
        <div className="form-submit-row">
          <p>Changes are visible as soon as they save.</p>
          <button
            type="submit"
            className="button button-dark"
            disabled={pending}
          >
            {pending ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Check size={17} />
            )}{" "}
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </main>
  );
}

// Photos can be removed, and added from a phone, after publishing. Model
// files cannot be replaced yet.
function PhotoSection({ hold }: { hold: Hold }) {
  const router = useRouter();
  const [selected, setSelected] = useState<PhonePhoto[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [added, setAdded] = useState(0);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const room = Math.max(0, 6 - hold.photos.length);

  async function remove(photoId: string, label: string) {
    if (!window.confirm(`Remove ${label}? This cannot be undone.`)) return;
    setRemoving(photoId);
    setErrors([]);
    const result = await removePhoto(hold.id, photoId);
    setRemoving(null);
    if ("error" in result) {
      setErrors([result.error]);
      return;
    }
    router.refresh();
  }

  async function add() {
    setSaving(true);
    setErrors([]);
    const result = await attachPhonePhotos(
      hold.id,
      selected.map((photo) => photo.id),
    );
    setSaving(false);
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    setAdded((count) => count + result.added);
    setSelected([]);
    router.refresh();
  }

  return (
    <section className="form-section" aria-labelledby="edit-photos-heading">
      <h2 id="edit-photos-heading">Photos</h2>
      <p className="small-note">
        {hold.photos.length
          ? `${hold.photos.length} of 6 photos. Remove one with its ✕. `
          : "No photos yet. "}
        {room
          ? "Add more from your phone; they appear after the current ones."
          : "This design has all the photos it can hold."}
      </p>
      {hold.photos.length > 0 && (
        <ul className="photo-previews" aria-label="Current photos">
          {hold.photos.map((photo, index) => {
            const label =
              index === 0 ? "the cover photo" : `photo ${index + 1}`;
            return (
              <li key={photo.id}>
                <img
                  src={photo.url}
                  alt={`${hold.title}, photo ${index + 1}`}
                />
                <span>
                  <strong>Photo {index + 1}</strong>
                  <small>
                    {index === 0 ? "Cover photo" : "Shown on the design page"}
                  </small>
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${label}`}
                  disabled={saving || removing !== null}
                  onClick={() => remove(photo.id, label)}
                >
                  {removing === photo.id ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <X size={15} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {room > 0 && (
        <>
          <PhonePhotoPicker
            designId={hold.id}
            selected={selected}
            onChange={setSelected}
            disabled={saving}
          />
          {selected.length > 0 && (
            <button
              type="button"
              className="button button-dark"
              disabled={saving}
              onClick={add}
            >
              {saving ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Check size={17} />
              )}{" "}
              {saving
                ? "Adding…"
                : `Add ${selected.length} ${selected.length === 1 ? "photo" : "photos"}`}
            </button>
          )}
        </>
      )}
      {added > 0 && (
        <p className="small-note" role="status">
          {added} {added === 1 ? "photo" : "photos"} added.
        </p>
      )}
      <FieldErrors errors={errors} />
    </section>
  );
}
