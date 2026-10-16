"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  FileBox,
  LoaderCircle,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { FieldErrors } from "@/components/form-fields";
import { PhotoImage } from "@/components/photo-image";
import { DesignFields } from "@/features/uploads/design-fields";
import { FilePicker } from "@/features/uploads/file-picker";
import { PhonePhotoPicker } from "@/features/uploads/phone-photo-picker";
import {
  attachPhonePhotos,
  type PhonePhoto,
} from "@/features/uploads/phone-actions";
import {
  cropPhoto,
  finishPhotoUpload,
  startPhotoUpload,
} from "@/features/uploads/photo-actions";
import { PhotoCropper } from "@/features/uploads/photo-cropper";
import {
  finishModelReplace,
  startModelReplace,
} from "@/features/uploads/model-actions";
import { uploadAll } from "@/features/uploads/put-files";
import {
  deleteDesign,
  removePhoto,
  setFileOrientation,
  updateDesign,
} from "./design-actions";
import { OrientationDialog } from "./orientation-picker";
import { formatBytes } from "./catalog";
import { readDesignInput } from "./design-form";
import type { CropRect } from "@/features/uploads/crop";
import { MAX_PHOTOS, MODEL_EXTENSIONS, validateDesign } from "./validation";
import type { Hold } from "./types";

// One Save for everything: the details, then any photos waiting in the
// list, whether chosen from this computer or sent from a phone. Photo
// removal is immediate, since it is confirmed on its own.
export function EditDesignForm({ hold }: { hold: Hold }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [selected, setSelected] = useState<PhonePhoto[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const room = Math.max(0, MAX_PHOTOS - hold.photos.length);
  const chosen = files.length + selected.length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const issues = validateDesign(readDesignInput(form));
    if (chosen > room)
      issues.push(
        `A design can have up to ${MAX_PHOTOS} photos; you can add ${room} more.`,
      );
    if (issues.length) {
      setErrors(issues);
      return;
    }
    setSaving(true);
    setErrors([]);
    const saved = await updateDesign(hold.id, form);
    if (saved.errors.length) {
      setSaving(false);
      setErrors(saved.errors);
      return;
    }
    const problems = await addPhotos();
    if (problems.length) {
      // The details are saved and any photos that made it are shown; the
      // rest can be chosen again.
      setSaving(false);
      setErrors(problems);
      router.refresh();
      return;
    }
    router.push(`/holds/${hold.id}`);
    router.refresh();
  }

  // Computer files go up through signed PUTs and are verified; phone photos
  // are already in the inbox and only need attaching. Both lists are cleared
  // afterwards so a retry never adds the same photo twice.
  async function addPhotos() {
    const problems: string[] = [];
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
      if ("errors" in start) problems.push(...start.errors);
      else {
        await uploadAll(
          start.uploads.map((upload, index) => ({
            url: upload.url,
            file: files[index],
            contentType: upload.contentType,
          })),
        );
        const finished = await finishPhotoUpload(
          hold.id,
          start.uploads.map((upload) => upload.fileId),
        );
        problems.push(...finished.errors);
      }
    }
    if (selected.length) {
      const result = await attachPhonePhotos(
        hold.id,
        selected.map((photo) => photo.id),
      );
      if ("errors" in result) problems.push(...result.errors);
    }
    setFiles([]);
    setSelected([]);
    return problems;
  }

  return (
    <main className="main-container form-page">
      <Link href={`/holds/${hold.id}`} className="back-link">
        <ArrowLeft size={15} /> Back to {hold.title}
      </Link>
      <div className="page-intro">
        <p className="eyebrow">EDIT DESIGN</p>
        <h1>{hold.title}</h1>
        <p>
          Update the details other makers see, add or remove photos, replace a
          model file, and set which way a model faces. Publication state stays
          as it is.
        </p>
      </div>
      <form
        onSubmit={submit}
        className="upload-form"
        aria-label="Edit design details"
        aria-busy={saving}
        noValidate
      >
        <fieldset className="upload-fields" disabled={saving}>
          <DesignFields defaults={hold} creator={hold.creator} />
        </fieldset>
        <PhotoSection
          hold={hold}
          room={room}
          files={files}
          onFiles={setFiles}
          selected={selected}
          onSelected={setSelected}
          disabled={saving}
        />
        <ModelSection hold={hold} disabled={saving} />
        <div className="upload-errors" aria-label="Edit errors">
          <FieldErrors errors={errors} />
        </div>
        <div className="form-submit-row">
          <p>
            {chosen
              ? `Saves your changes and adds ${chosen} ${chosen === 1 ? "photo" : "photos"}.`
              : "Changes are visible as soon as they save."}
          </p>
          <button
            type="submit"
            className="button button-dark"
            disabled={saving}
          >
            {saving ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Check size={17} />
            )}{" "}
            {saving ? "Saving…" : "Save changes"}
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

// The model files as uploaded, with the orientation of each STL. A new
// orientation is saved on its own, like a crop, since it is confirmed in
// its dialog. Replacing a file is immediate too: it is confirmed first,
// then goes up through a signed PUT and is verified before it takes the
// old file's place (see uploads/model-actions.ts).
function ModelSection({ hold, disabled }: { hold: Hold; disabled: boolean }) {
  const router = useRouter();
  const [orienting, setOrienting] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const open = hold.files.find((file) => file.id === orienting);
  // One hidden file input serves every Replace button; this is the file
  // it was opened for.
  const picker = useRef<HTMLInputElement>(null);
  const target = useRef<string | null>(null);
  const busy = disabled || saving !== null || replacing !== null;

  async function replace(fileId: string, file: File) {
    const current = hold.files.find((item) => item.id === fileId);
    if (
      !current ||
      !window.confirm(
        `Replace ${current.name} with ${file.name}? The current file is removed for good and downloads switch to the new one.`,
      )
    )
      return;
    setReplacing(fileId);
    setError("");
    const start = await startModelReplace(hold.id, fileId, {
      kind: "model",
      name: file.name,
      bytes: file.size,
      type: file.type,
    });
    if ("errors" in start) {
      setReplacing(null);
      setError(start.errors.join(" "));
      return;
    }
    // A PUT that fails is reported by the finish step, which also removes
    // the row it reserved.
    await uploadAll([
      { url: start.upload.url, file, contentType: start.upload.contentType },
    ]);
    const finished = await finishModelReplace(
      hold.id,
      fileId,
      start.upload.fileId,
    );
    setReplacing(null);
    if ("errors" in finished) {
      setError(finished.errors.join(" "));
      return;
    }
    router.refresh();
  }

  async function apply(fileId: string, orientation: string) {
    setOrienting(null);
    setSaving(fileId);
    setError("");
    const result = await setFileOrientation(hold.id, fileId, orientation);
    setSaving(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className="form-section" aria-labelledby="edit-models-heading">
      <h2 id="edit-models-heading">Model files</h2>
      <p className="small-note">
        Replace a file to put a corrected version in its place; the old file is
        removed and downloads switch to the new one. If a model shows upside
        down or on its side, set its orientation instead: that never changes the
        file.
      </p>
      <input
        ref={picker}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        accept={MODEL_EXTENSIONS.map((extension) => `.${extension}`).join(",")}
        onChange={(event) => {
          const file = event.target.files?.[0];
          const fileId = target.current;
          event.target.value = "";
          if (file && fileId) void replace(fileId, file);
        }}
      />
      <ul className="file-list" aria-label="Model files">
        {hold.files.map((file) => (
          <li key={file.id}>
            <FileBox size={21} />
            <span>
              <strong title={file.name}>{file.name}</strong>
              <small>
                {formatBytes(file.bytes)}
                {file.orientation !== "x,y,z" ? " · orientation set" : ""}
              </small>
            </span>
            {file.extension.toLowerCase() === "stl" && file.url && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => setOrienting(file.id)}
              >
                {saving === file.id ? "Saving…" : "Orientation"}
              </button>
            )}
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                target.current = file.id;
                picker.current?.click();
              }}
            >
              {replacing === file.id ? (
                <>
                  <LoaderCircle size={13} className="spin" /> Replacing…
                </>
              ) : (
                <>
                  <RefreshCw size={13} /> Replace
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
      <FieldErrors errors={error ? [error] : []} />
      {open && (
        <OrientationDialog
          source={{ key: open.id, url: open.url }}
          name={open.name}
          value={open.orientation}
          color={hold.color}
          onCancel={() => setOrienting(null)}
          onApply={(orientation) => apply(open.id, orientation)}
        />
      )}
    </section>
  );
}

// Current photos with removal, plus the two ways to add more. Chosen photos
// wait in their lists until the form is saved.
function PhotoSection({
  hold,
  room,
  files,
  onFiles,
  selected,
  onSelected,
  disabled,
}: {
  hold: Hold;
  room: number;
  files: File[];
  onFiles: (files: File[]) => void;
  selected: PhonePhoto[];
  onSelected: (photos: PhonePhoto[]) => void;
  disabled: boolean;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<string[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [cropping, setCropping] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const busy = disabled || removing !== null || saving !== null;

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

  async function crop(photoId: string, rect: CropRect) {
    setCropping(null);
    setSaving(photoId);
    setErrors([]);
    const result = await cropPhoto(hold.id, photoId, rect);
    setSaving(null);
    if ("error" in result) {
      setErrors([result.error]);
      return;
    }
    router.refresh();
  }

  const open = hold.photos.find((photo) => photo.id === cropping);
  return (
    <section className="form-section" aria-labelledby="edit-photos-heading">
      <h2 id="edit-photos-heading">Photos</h2>
      <p className="small-note">
        {hold.photos.length
          ? `${hold.photos.length} of ${MAX_PHOTOS} photos. Remove one with its ✕. `
          : "No photos yet. "}
        {room
          ? `Add up to ${room} more from this computer or your phone; they are added when you save and appear after the current ones.`
          : "This design has all the photos it can hold."}
      </p>
      {hold.photos.length > 0 && (
        <ul className="photo-previews" aria-label="Current photos">
          {hold.photos.map((photo, index) => {
            const label =
              index === 0 ? "the cover photo" : `photo ${index + 1}`;
            return (
              <li key={photo.id}>
                <PhotoImage
                  src={photo.cardUrl}
                  fallback={photo.url}
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
                  className="text-button"
                  disabled={busy}
                  onClick={() => setCropping(photo.id)}
                >
                  {saving === photo.id ? "Cropping…" : "Crop"}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${label}`}
                  disabled={busy}
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
            disabled={disabled}
            files={files}
            onChange={onFiles}
            accept="image/jpeg,image/png,image/webp"
          />
          <PhonePhotoPicker
            designId={hold.id}
            selected={selected}
            onChange={onSelected}
            disabled={disabled}
          />
        </>
      )}
      <FieldErrors errors={errors} />
      {open && (
        <PhotoCropper
          source={open.url}
          name={`photo ${hold.photos.indexOf(open) + 1}`}
          onCancel={() => setCropping(null)}
          onApply={(rect) => crop(open.id, rect)}
        />
      )}
    </section>
  );
}
