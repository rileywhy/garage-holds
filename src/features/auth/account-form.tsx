"use client";

import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { Field, FieldErrors } from "@/components/form-fields";
import {
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
} from "@/features/profiles/validation";
import { updateDisplayName } from "./actions";

export function DisplayNameForm({ displayName }: { displayName: string }) {
  const [state, action, pending] = useActionState(updateDisplayName, {
    displayName,
    errors: [],
    saved: false,
  });
  return (
    <form action={action} className="account-form" aria-busy={pending}>
      <Field
        label="Display name"
        hint={`Shown on your designs and reviews. ${DISPLAY_NAME_MIN} to ${DISPLAY_NAME_MAX} characters, unique across Garage Holds.`}
      >
        <input
          name="displayName"
          required
          minLength={DISPLAY_NAME_MIN}
          maxLength={DISPLAY_NAME_MAX}
          defaultValue={state.displayName}
          autoComplete="nickname"
        />
      </Field>
      <FieldErrors errors={state.errors} />
      {state.saved && !state.errors.length && (
        <p className="success-box" role="status">
          Display name saved.
        </p>
      )}
      <button type="submit" className="button button-dark" disabled={pending}>
        {pending && <LoaderCircle size={16} className="spin" />}{" "}
        {pending ? "Saving…" : "Save display name"}
      </button>
    </form>
  );
}
