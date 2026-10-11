"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Layers3,
  LoaderCircle,
  CircleCheck,
} from "lucide-react";
import { FieldErrors } from "@/components/form-fields";
import { readDesignInput } from "@/features/holds/design-form";
import { MODEL_EXTENSIONS, validateUpload } from "@/features/holds/validation";
import { DesignFields } from "./design-fields";
import { FilePicker } from "./file-picker";
import { PhonePhotoPicker } from "./phone-photo-picker";
import { abandonDraft, createDraft, finalizeDesign } from "./actions";
import type { PhonePhoto } from "./phone-actions";
import { uploadAll } from "./put-files";

export function UploadForm({ creator }: { creator: string }) {
  const [formVersion, setFormVersion] = useState(0);
  return (
    <UploadDesignForm
      key={formVersion}
      creator={creator}
      focusTitle={formVersion > 0}
      onStartAnother={() => setFormVersion((version) => version + 1)}
    />
  );
}

type Progress = "" | "Saving design…" | "Uploading files…" | "Publishing…";

function UploadDesignForm({
  creator,
  onStartAnother,
  focusTitle,
}: {
  creator: string;
  onStartAnother: () => void;
  focusTitle: boolean;
}) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [phonePhotos, setPhonePhotos] = useState<PhonePhoto[]>([]);
  const [models, setModels] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [progress, setProgress] = useState<Progress>("");
  const busy = progress !== "";
  const [photoReminder, setPhotoReminder] = useState(false);
  const [savedHold, setSavedHold] = useState<{
    id: string;
    title: string;
    fileCount: number;
  } | null>(null);
  const saving = useRef(false);
  const completionRegion = useRef<HTMLDivElement>(null);
  const errorRegion = useRef<HTMLDivElement>(null);
  const photoReminderRegion = useRef<HTMLDivElement>(null);
  const photoCount = photos.length + phonePhotos.length;
  const skippingPhotos = photoReminder && photoCount === 0;

  function showErrors(errors: string[]) {
    setErrors(errors);
    requestAnimationFrame(() => {
      errorRegion.current?.focus({ preventScroll: true });
      errorRegion.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || savedHold) return;
    const form = new FormData(event.currentTarget);
    const input = readDesignInput(form);
    const sharingPermission = form.get("ownership") === "on";
    const issues = validateUpload(
      input,
      models,
      [
        ...photos,
        ...phonePhotos.map((photo) => ({
          name: photo.name,
          size: photo.bytes,
          type: "image/jpeg",
        })),
      ],
      sharingPermission,
    );
    if (issues.length) {
      showErrors(issues);
      return;
    }
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (!photoCount && submitter?.getAttribute("name") !== "skipPhoto") {
      setPhotoReminder(true);
      setErrors([]);
      requestAnimationFrame(() => {
        photoReminderRegion.current?.focus({ preventScroll: true });
        photoReminderRegion.current?.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      });
      return;
    }
    saving.current = true;
    setErrors([]);
    try {
      setProgress("Saving design…");
      const allFiles = [...photos, ...models];
      const draft = await createDraft(
        input,
        allFiles.map((file, index) => ({
          kind: index < photos.length ? "photo" : "model",
          name: file.name,
          bytes: file.size,
          type: file.type,
        })),
        sharingPermission,
        phonePhotos.map((photo) => photo.id),
      );
      if ("errors" in draft) {
        showErrors(draft.errors);
        return;
      }
      // From here on a failure removes the draft again, so trying again
      // starts clean instead of leaving a half-uploaded design behind.
      let published = false;
      try {
        setProgress("Uploading files…");
        const failed = await uploadAll(
          draft.uploads.map((upload, index) => ({
            url: upload.url,
            file: allFiles[index],
          })),
        );
        if (failed.length) {
          showErrors([
            `${failed.join(", ")} did not upload. Check your connection and try again.`,
          ]);
          return;
        }
        setProgress("Publishing…");
        const result = await finalizeDesign(
          draft.designId,
          phonePhotos.map((photo) => photo.id),
        );
        if ("errors" in result) {
          showErrors(result.errors);
          return;
        }
        published = true;
      } finally {
        if (!published) abandonDraft(draft.designId).catch(() => undefined);
      }
      setSavedHold({
        id: draft.designId,
        title: input.title,
        fileCount: models.length,
      });
      setPhotoReminder(false);
      requestAnimationFrame(() => {
        completionRegion.current?.focus({ preventScroll: true });
        completionRegion.current?.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      });
    } catch (error) {
      showErrors([
        error instanceof Error
          ? error.message
          : "Your upload could not be saved.",
      ]);
    } finally {
      saving.current = false;
      setProgress("");
    }
  }

  return (
    <main className="main-container form-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={15} /> Back to the library
      </Link>
      <div className="page-intro">
        <p className="eyebrow">MAKE. PRINT. SHARE.</p>
        <h1>A new grip starts here.</h1>
        <p>
          Bring your design to the board. Give other makers the details they
          need.
        </p>
      </div>
      <div className="upload-layout">
        <form
          onSubmit={submit}
          className="upload-form"
          aria-label="Upload a hold design"
          aria-busy={busy}
          noValidate
        >
          <fieldset className="upload-fields" disabled={busy || !!savedHold}>
            <DesignFields
              creator={creator}
              focusTitle={focusTitle}
              sharingConfirmation
              filesSection={
                <>
                  <FilePicker
                    kind="photos"
                    disabled={busy || !!savedHold}
                    files={photos}
                    onChange={setPhotos}
                    accept="image/jpeg,image/png,image/webp"
                  />
                  <PhonePhotoPicker
                    disabled={busy || !!savedHold}
                    selected={phonePhotos}
                    onChange={setPhonePhotos}
                  />
                  <FilePicker
                    kind="models"
                    disabled={busy || !!savedHold}
                    files={models}
                    onChange={setModels}
                    accept={MODEL_EXTENSIONS.map(
                      (extension) => `.${extension}`,
                    ).join(",")}
                  />
                </>
              }
            />
            {skippingPhotos && !savedHold && (
              <div
                className="photo-reminder"
                ref={photoReminderRegion}
                tabIndex={-1}
              >
                <strong>Got a photo? We’d love to see it.</strong>
                <p>
                  Please add a photo if you have one—we’d really appreciate it!
                  It helps other makers see the grip and texture. No photo yet?
                  You can still continue below.
                </p>
                <a href="#hold-photos" onClick={() => setPhotoReminder(false)}>
                  Go back and add a photo
                </a>
              </div>
            )}
          </fieldset>
          <div
            ref={errorRegion}
            tabIndex={-1}
            aria-label="Upload errors"
            className="upload-errors"
          >
            <FieldErrors errors={errors} />
          </div>
          {savedHold ? (
            <div
              className="upload-complete"
              ref={completionRegion}
              tabIndex={-1}
              aria-labelledby="upload-complete-heading"
            >
              <div className="completion-icon">
                <CircleCheck size={28} strokeWidth={1.5} />
              </div>
              <div role="status">
                <p className="eyebrow">PUBLISHED</p>
                <h2 id="upload-complete-heading">Design published.</h2>
                <p>
                  <strong>{savedHold.title}</strong> and{" "}
                  {savedHold.fileCount === 1
                    ? "its original file are"
                    : "its original files are"}{" "}
                  live in the library for everyone to download.
                </p>
              </div>
              <div className="completion-actions">
                <Link
                  className="button button-dark"
                  href={`/holds/${savedHold.id}`}
                >
                  View your design <ArrowUpRight size={16} />
                </Link>
                <button
                  className="button button-outline"
                  type="button"
                  onClick={onStartAnother}
                >
                  Add another design
                </button>
                <Link className="completion-library-link" href="/">
                  Back to the library
                </Link>
              </div>
            </div>
          ) : (
            <div className="form-submit-row">
              <p>
                Publishing makes your files downloadable by anyone
                <br />
                under the license you choose.
              </p>
              <button
                className="button button-dark"
                disabled={busy}
                type="submit"
                name={skippingPhotos ? "skipPhoto" : undefined}
              >
                {busy ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <PlusIcon />
                )}{" "}
                {busy
                  ? progress
                  : skippingPhotos
                    ? "Continue without a photo"
                    : "Publish design"}
              </button>
            </div>
          )}
        </form>
        <aside className="upload-aside">
          <Layers3 size={31} strokeWidth={1.3} />
          <h3>
            Built for makers.
            <br />
            Made for climbing.
          </h3>
          <p>
            The useful details are the ones you wish you’d known before pressing
            print.
          </p>
          <ul>
            <li>
              <Check size={15} /> Clear photos of the gripping surface
            </li>
            <li>
              <Check size={15} /> Size and mounting hardware
            </li>
            <li>
              <Check size={15} /> Material, print settings, and texture notes
            </li>
            <li>
              <Check size={15} /> Honest notes about your testing
            </li>
          </ul>
          <div className="aside-divider" />
          <p className="small-note">
            Recipes and grade suggestions are creator reports. They don’t
            certify a printed hold’s strength.
          </p>
          <span className="aside-label">EARLY ACCESS</span>
          <p className="small-note">
            Files upload straight to storage and publish once every file is
            verified. Editing and paid bundles are coming.
          </p>
        </aside>
      </div>
    </main>
  );
}

function PlusIcon() {
  return <ArrowUpRight size={17} />;
}
