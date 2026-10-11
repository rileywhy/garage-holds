"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, LoaderCircle, Trash2, X } from "lucide-react";
import { FieldErrors } from "@/components/form-fields";
import { DesignFields } from "@/features/uploads/design-fields";
import { FilePicker } from "@/features/uploads/file-picker";
import { PhonePhotoPicker } from "@/features/uploads/phone-photo-picker";
import {
  attachPhonePhotos,
  type PhonePhoto,
} from "@/features/uploads/phone-actions";
import {
  finishPhotoUpload,
  startPhotoUpload,
} from "@/features/uploads/photo-actions";
import { uploadAll } from "@/features/uploads/put-files";
import { deleteDesign, removePhoto, updateDesign } from "./design-actions";
import { MAX_PHOTOS } from "./validation";
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
      <DeleteSection hold={hold} />
    </main>
  );
}

// Deleting removes the files, reviews, and saves with the design. Kept
// outside the edit form so a stray Enter can never reach it.
function DeleteSection({ hold }: { hold: Hold }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (
      !window.confirm(
        `Delete "${hold.title}" for good? Its files, reviews, and saves go with it. This cannot be undone.`,
      )
    )
      return;
    setDeleting(true);
    setError("");
    const result = await deleteDesign(hold.id);
    if ("error" in result) {
      setDeleting(false);
      setError(result.error);
      return;
    }
    router.push("/designs");
    router.refresh();
  }

  return (
    <section className="danger-zone" aria-labelledby="delete-design-heading">
      <h2 id="delete-design-heading">Delete this design</h2>
      <p className="small-note">
        Removes it from the library along with its files, reviews, and saves.
        There is no undo.
      </p>
      <button
        type="button"
        className="button button-outline button-danger"
        disabled={deleting}
        onClick={remove}
      >
        {deleting ? (
          <LoaderCircle size={17} className="spin" />
        ) : (
          <Trash2 size={17} />
        )}{" "}
        {deleting ? "Deleting…" : "Delete design"}
      </button>
      <FieldErrors errors={error ? [error] : []} />
    </section>
  );
}

// Photos can be removed, and added from this computer or a phone, after
// publishing. Model files cannot be replaced yet.
function PhotoSection({ hold }: { hold: Hold }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [selected, setSelected] = useState<PhonePhoto[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [added, setAdded] = useState(0);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const room = Math.max(0, MAX_PHOTOS - hold.photos.length);
  const chosen = files.length + selected.length;

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

  // Computer files go up through signed PUTs and are verified; phone photos
  // are already in the inbox and only need attaching. Both are cleared after
  // an attempt so a retry never adds the same photo twice.
  async function add() {
    if (chosen > room) {
      setErrors([
        `A design can have up to ${MAX_PHOTOS} photos; you can add ${room} more.`,
      ]);
      return;
    }
    setSaving(true);
    setErrors([]);
    const problems: string[] = [];
    let count = 0;
    if (files.length) {
      const start = await startPhotoUpload(
        hold.id,
        files.map((file) => ({
          kind: "photo",
          name: file.name,
          bytes: file.size,
          type: file.type,
        })),
      );
      if ("errors" in start) {
        setSaving(false);
        setErrors(start.errors);
        return;
      }
      await uploadAll(
        start.uploads.map((upload, index) => ({
          url: upload.url,
          file: files[index],
        })),
      );
      const finished = await finishPhotoUpload(
        hold.id,
        start.uploads.map((upload) => upload.fileId),
      );
      count += finished.added;
      problems.push(...finished.errors);
    }
    if (selected.length) {
      const result = await attachPhonePhotos(
        hold.id,
        selected.map((photo) => photo.id),
      );
      if ("errors" in result) problems.push(...result.errors);
      else count += result.added;
    }
    setSaving(false);
    setAdded((total) => total + count);
    setErrors(problems);
    setFiles([]);
    setSelected([]);
    if (count) router.refresh();
  }

  return (
    <section className="form-section" aria-labelledby="edit-photos-heading">
      <h2 id="edit-photos-heading">Photos</h2>
      <p className="small-note">
        {hold.photos.length
          ? `${hold.photos.length} of 6 photos. Remove one with its ✕. `
          : "No photos yet. "}
        {room
          ? `Add up to ${room} more from this computer or your phone; they appear after the current ones.`
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
          <FilePicker
            kind="photos"
            compact
            disabled={saving}
            files={files}
            onChange={setFiles}
            accept="image/jpeg,image/png,image/webp"
          />
          <PhonePhotoPicker
            designId={hold.id}
            selected={selected}
            onChange={setSelected}
            disabled={saving}
          />
          {chosen > 0 && (
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
                : `Add ${chosen} ${chosen === 1 ? "photo" : "photos"}`}
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
