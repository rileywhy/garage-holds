"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, LoaderCircle } from "lucide-react";
import { FieldErrors } from "@/components/form-fields";
import { DesignFields } from "@/features/uploads/design-fields";
import { updateDesign } from "./design-actions";
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
