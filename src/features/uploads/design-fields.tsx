"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Field } from "@/components/form-fields";
import { ProblemGradeField } from "@/components/problem-grade-field";
import {
  HOLD_SIZES,
  HOLD_TYPES,
  MATERIALS,
  MOUNT_TYPES,
  SPECIAL_PROCESSES,
  type DesignInput,
} from "@/features/holds/types";
import { LicenseField } from "./license-field";
import { DesignMethodField } from "./design-method-field";

// The metadata sections shared by the upload and edit forms. The upload form
// slots its file pickers in as section two; editing has no files section.
export function DesignFields({
  defaults,
  creator,
  focusTitle = false,
  filesSection,
  sharingConfirmation = false,
}: {
  defaults?: DesignInput;
  creator: string;
  focusTitle?: boolean;
  filesSection?: ReactNode;
  sharingConfirmation?: boolean;
}) {
  const recipe = defaults?.recipes[0];
  let section = 0;
  const number = () => String(++section).padStart(2, "0");
  return (
    <>
      <section className="form-section">
        <div className="section-heading">
          <span>{number()}</span>
          <div>
            <h2>The essentials</h2>
            <p>Name the hold and describe its grip and intended use.</p>
          </div>
        </div>
        <Field label="Design name *">
          <input
            name="title"
            autoFocus={focusTitle}
            required
            minLength={3}
            maxLength={80}
            defaultValue={defaults?.title}
            placeholder="e.g. Mesa edge"
          />
        </Field>
        <p className="field-hint">
          Published as <strong>{creator}</strong>. Change your display name from{" "}
          <Link href="/account">your account</Link>.
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
            defaultValue={defaults?.description}
            placeholder="Describe the feel, intended use, mounting hardware, and any testing you’ve done."
          />
        </Field>
      </section>
      {filesSection && (
        <section className="form-section" id="hold-photos">
          <div className="section-heading">
            <span>{number()}</span>
            <div>
              <h2>Photos & files</h2>
              <p>
                Photos are optional. Add one for your cover, or we’ll use an STL
                preview when available. Original files stay intact.
              </p>
            </div>
          </div>
          {filesSection}
        </section>
      )}
      <section className="form-section">
        <div className="section-heading">
          <span>{number()}</span>
          <div>
            <h2>Hold details</h2>
            <p>Climbing details make your design easier to discover.</p>
          </div>
        </div>
        <div className="form-grid three">
          <Field label="Hold type *">
            <select name="type" defaultValue={defaults?.type ?? "Jug"}>
              {HOLD_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </Field>
          <Field label="Size *">
            <select name="size" defaultValue={defaults?.size ?? "Medium"}>
              {HOLD_SIZES.map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </Field>
          <Field label="Mounting *">
            <select name="mount" defaultValue={defaults?.mount ?? "Screw-on"}>
              {MOUNT_TYPES.map((mount) => (
                <option key={mount}>{mount}</option>
              ))}
            </select>
          </Field>
        </div>
        <ProblemGradeField defaultValue={defaults?.problemGrade ?? null} />
      </section>
      <section className="form-section">
        <div className="section-heading">
          <span>{number()}</span>
          <div>
            <h2>Printing recipe</h2>
            <p>Share your print settings, texture, and any special steps.</p>
          </div>
        </div>
        <div className="form-grid">
          <Field label="Material *">
            <input
              name="material"
              list="materials"
              defaultValue={recipe?.material ?? "PETG"}
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
            <select
              name="specialProcess"
              defaultValue={recipe?.specialProcess ?? ""}
            >
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
            defaultValue={recipe?.notes}
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
            defaultValue={recipe?.textureNotes}
            placeholder="Slicer, fuzzy skin thickness and point distance, where you apply texture, and what worked…"
          />
        </Field>
        <Field label="Finishing / treatment notes (optional)">
          <input
            name="postProcessing"
            maxLength={200}
            defaultValue={recipe?.postProcessing}
            placeholder="e.g. salt annealing, sanding, or none"
          />
        </Field>
        <Field label="Tags" hint="Separate tags with commas. Up to 12 tags.">
          <input
            name="tags"
            maxLength={300}
            defaultValue={defaults?.tags.join(", ")}
            placeholder="board training, warm-up, textured"
          />
        </Field>
      </section>
      <section className="form-section">
        <div className="section-heading">
          <span>{number()}</span>
          <div>
            <h2>Sharing</h2>
            <p>Free downloads are the starting point for the pile.</p>
          </div>
        </div>
        <DesignMethodField />
        <LicenseField defaultValue={defaults?.license ?? ""} />
        {sharingConfirmation && (
          <label className="checkbox-row ownership-check">
            <input name="ownership" type="checkbox" required />
            <span>
              I created these files or have permission to share them under the
              selected license.
            </span>
          </label>
        )}
      </section>
    </>
  );
}
