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
import { ProblemGradeField } from "@/components/problem-grade-field";
import { Field, FieldErrors } from "@/components/form-fields";
import { optionalNumber } from "@/lib/form-data";
import {
  HOLD_TYPES,
  HOLD_SIZES,
  MOUNT_TYPES,
  MATERIALS,
  SPECIAL_PROCESSES,
  type DesignInput,
} from "@/features/holds/types";
import { MODEL_EXTENSIONS, validateUpload } from "@/features/holds/validation";
import { FilePicker } from "./file-picker";
import { LicenseField } from "./license-field";
import { createDraft, finalizeDesign } from "./actions";

const PARALLEL_UPLOADS = 3;

// Browser-to-R2 PUTs, a few at a time, so one large file never blocks photos.
async function uploadAll(jobs: { url: string; file: File }[]) {
  const queue = [...jobs];
  const failed: string[] = [];
  await Promise.all(
    Array.from({ length: PARALLEL_UPLOADS }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        try {
          const response = await fetch(job.url, {
            method: "PUT",
            body: job.file,
            headers: {
              "Content-Type": job.file.type || "application/octet-stream",
            },
          });
          if (!response.ok) failed.push(job.file.name);
        } catch {
          failed.push(job.file.name);
        }
      }
    }),
  );
  return failed;
}

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
  const skippingPhotos = photoReminder && photos.length === 0;

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
    const text = (key: string) => String(form.get(key) ?? "").trim();
    const input: DesignInput = {
      title: text("title"),
      description: text("description"),
      type: text("type") as DesignInput["type"],
      size: text("size") as DesignInput["size"],
      mount: text("mount") as DesignInput["mount"],
      problemGrade: optionalNumber(form.get("problemGrade")),
      recipes: [
        {
          material: text("material"),
          specialProcess: (text("specialProcess") ||
            null) as DesignInput["recipes"][number]["specialProcess"],
          notes: text("printNotes"),
          textureNotes: text("textureNotes"),
          postProcessing: text("postProcessing"),
        },
      ],
      tags: [
        ...new Set(
          text("tags")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ].slice(0, 12),
      license: text("license") as DesignInput["license"],
    };
    const sharingPermission = form.get("ownership") === "on";
    const issues = validateUpload(input, models, photos, sharingPermission);
    if (issues.length) {
      showErrors(issues);
      return;
    }
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (!photos.length && submitter?.getAttribute("name") !== "skipPhoto") {
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
      );
      if ("errors" in draft) {
        showErrors(draft.errors);
        return;
      }
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
      const published = await finalizeDesign(draft.designId);
      if ("errors" in published) {
        showErrors(published.errors);
        return;
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
            <section className="form-section">
              <div className="section-heading">
                <span>01</span>
                <div>
                  <h2>The essentials</h2>
                  <p>Tell us what makes this hold yours.</p>
                </div>
              </div>
              <Field label="Design name *">
                <input
                  name="title"
                  autoFocus={focusTitle}
                  required
                  minLength={3}
                  maxLength={80}
                  placeholder="e.g. Mesa edge"
                />
              </Field>
              <p className="field-hint">
                Published as <strong>{creator}</strong>. Change your display
                name from <Link href="/account">your account</Link>.
              </p>
              <Field
                label="Description *"
                hint="At least 20 characters. A sentence about the grip or intended use is enough."
              >
                <textarea
                  name="description"
                  required
                  minLength={20}
                  maxLength={5000}
                  rows={4}
                  placeholder="Describe the feel, intended use, mounting hardware, and any testing you’ve done."
                />
              </Field>
            </section>
            <section className="form-section" id="hold-photos">
              <div className="section-heading">
                <span>02</span>
                <div>
                  <h2>Photos & files</h2>
                  <p>
                    Photos are optional. Add one for your cover, or we’ll use an
                    STL preview when available. Original files stay intact.
                  </p>
                </div>
              </div>
              <FilePicker
                kind="photos"
                disabled={busy || !!savedHold}
                files={photos}
                onChange={setPhotos}
                accept="image/jpeg,image/png,image/webp"
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
            </section>
            <section className="form-section">
              <div className="section-heading">
                <span>03</span>
                <div>
                  <h2>Find the right fit</h2>
                  <p>Climbing details make your design easier to discover.</p>
                </div>
              </div>
              <div className="form-grid three">
                <Field label="Hold type *">
                  <select name="type">
                    {HOLD_TYPES.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Size *">
                  <select name="size" defaultValue="Medium">
                    {HOLD_SIZES.map((size) => (
                      <option key={size}>{size}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Mounting *">
                  <select name="mount" defaultValue="Screw-on">
                    {MOUNT_TYPES.map((mount) => (
                      <option key={mount}>{mount}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <ProblemGradeField />
            </section>
            <section className="form-section">
              <div className="section-heading">
                <span>04</span>
                <div>
                  <h2>Printing recipe</h2>
                  <p>
                    Share your print settings, texture, and any special steps.
                  </p>
                </div>
              </div>
              <div className="form-grid">
                <Field label="Material *">
                  <input
                    name="material"
                    list="materials"
                    defaultValue="PETG"
                    required
                    maxLength={80}
                  />
                  <datalist id="materials">
                    {MATERIALS.map((material) => (
                      <option value={material} key={material} />
                    ))}
                  </datalist>
                </Field>
                <Field
                  label="Special process (optional)"
                  hint="Leave blank for a normal print."
                >
                  <select name="specialProcess" defaultValue="">
                    <option value="">No special process</option>
                    {SPECIAL_PROCESSES.map((process) => (
                      <option key={process}>{process}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Print settings & notes">
                <textarea
                  name="printNotes"
                  rows={3}
                  maxLength={2000}
                  placeholder="Orientation, layer height, walls, infill, printer, and what you tested…"
                />
              </Field>
              <Field
                label="Fuzzy skin / texture notes (optional)"
                hint="Share settings you’ve tried and how the texture felt. Leave blank if you don’t use added texture."
              >
                <textarea
                  name="textureNotes"
                  rows={3}
                  maxLength={2000}
                  placeholder="Slicer, fuzzy skin thickness and point distance, where you apply texture, and what worked…"
                />
              </Field>
              <Field label="Finishing / treatment notes (optional)">
                <input
                  name="postProcessing"
                  maxLength={200}
                  placeholder="e.g. salt annealing, sanding, or none"
                />
              </Field>
              <Field
                label="Tags"
                hint="Separate tags with commas. Up to 12 tags."
              >
                <input
                  name="tags"
                  maxLength={300}
                  placeholder="board training, warm-up, textured"
                />
              </Field>
            </section>
            <section className="form-section">
              <div className="section-heading">
                <span>05</span>
                <div>
                  <h2>Sharing</h2>
                  <p>Free downloads are the starting point for this library.</p>
                </div>
              </div>
              <LicenseField />
              <label className="checkbox-row ownership-check">
                <input name="ownership" type="checkbox" required />
                <span>
                  I created these files or have permission to share them under
                  the selected license.
                </span>
              </label>
            </section>
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
