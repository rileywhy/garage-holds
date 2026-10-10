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
import { useLibrary } from "@/components/library-provider";
import {
  HOLD_TYPES,
  HOLD_SIZES,
  MOUNT_TYPES,
  MATERIALS,
  SPECIAL_PROCESSES,
  type Hold,
} from "@/features/holds/types";
import { MODEL_EXTENSIONS, validateUpload } from "@/features/holds/validation";
import { FilePicker } from "./file-picker";
import { LicenseField } from "./license-field";

export function UploadForm() {
  const [formVersion, setFormVersion] = useState(0);
  return (
    <UploadDesignForm
      key={formVersion}
      focusTitle={formVersion > 0}
      onStartAnother={() => setFormVersion((version) => version + 1)}
    />
  );
}

function UploadDesignForm({
  onStartAnother,
  focusTitle,
}: {
  onStartAnother: () => void;
  focusTitle: boolean;
}) {
  const { addHold, ready, storageError } = useLibrary();
  const [photos, setPhotos] = useState<File[]>([]);
  const [models, setModels] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [photoReminder, setPhotoReminder] = useState(false);
  const [savedHold, setSavedHold] = useState<Hold | null>(null);
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
    const id = crypto.randomUUID();
    const photoIds = photos.map(() => crypto.randomUUID());
    const files = models.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      bytes: file.size,
      extension: file.name.split(".").pop()?.toLowerCase() ?? "",
    }));
    const hold: Hold = {
      id,
      title: text("title"),
      creator: text("creator"),
      description: text("description"),
      type: text("type") as Hold["type"],
      size: text("size") as Hold["size"],
      mount: text("mount") as Hold["mount"],
      problemGrade: optionalNumber(form.get("problemGrade")),
      recipes: [
        {
          material: text("material"),
          specialProcess: (text("specialProcess") ||
            null) as Hold["recipes"][number]["specialProcess"],
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
      license: text("license") as Hold["license"],
      color: "#a2b5a6",
      illustration: "ripple",
      photoIds,
      files,
      createdAt: new Date().toISOString(),
      isSample: false,
    };
    const issues = validateUpload(
      hold,
      models,
      photos,
      form.get("ownership") === "on",
    );
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
    setBusy(true);
    setErrors([]);
    try {
      await addHold(hold, [
        ...photos.map((file, index) => ({ id: photoIds[index], file })),
        ...models.map((file, index) => ({ id: files[index].id, file })),
      ]);
      setSavedHold(hold);
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
      setBusy(false);
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
            {storageError && (
              <p className="error-box" role="alert">
                {storageError}
              </p>
            )}
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
              <Field
                label="Creator name *"
                hint="This is a display name for the local prototype, not a verified account."
              >
                <input
                  name="creator"
                  required
                  minLength={2}
                  maxLength={50}
                  placeholder="Your name or studio"
                  autoComplete="nickname"
                />
              </Field>
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
                <p className="eyebrow">READY FOR YOUR LIBRARY</p>
                <h2 id="upload-complete-heading">Design added.</h2>
                <p>
                  <strong>{savedHold.title}</strong> and{" "}
                  {savedHold.files.length === 1
                    ? "its original file are"
                    : "its original files are"}{" "}
                  saved in this browser. Your design is ready to view.
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
                Saved to this browser.
                <br />
                Public sharing will arrive with account integration.
              </p>
              <button
                className="button button-dark"
                disabled={busy || !ready || !!storageError}
                type="submit"
                name={skippingPhotos ? "skipPhoto" : undefined}
              >
                {busy ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <PlusIcon />
                )}{" "}
                {busy
                  ? "Saving design…"
                  : skippingPhotos
                    ? "Continue without a photo"
                    : "Add to local library"}
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
          <span className="aside-label">THE FIRST VERSION</span>
          <p className="small-note">
            Accounts, public publishing, paid bundles, and interactive 3D
            viewing are planned next. This version keeps your work on your
            device.
          </p>
        </aside>
      </div>
    </main>
  );
}

function PlusIcon() {
  return <ArrowUpRight size={17} />;
}
