"use client";

import { useActionState } from "react";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { Field, FieldErrors } from "@/components/form-fields";
import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
} from "@/features/profiles/validation";
import { saveProfile } from "./actions";

export function ProfileForm({
  displayName,
  bio,
  next,
}: {
  displayName: string;
  bio: string;
  // Present on the welcome page: continue there after the first save.
  next?: string;
}) {
  const [state, action, pending] = useActionState(saveProfile, {
    displayName,
    bio,
    errors: [],
    saved: false,
  });
  const welcome = next !== undefined;
  return (
    <form action={action} className="account-form" aria-busy={pending}>
      {welcome && <input type="hidden" name="next" value={next} />}
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
          autoFocus={welcome}
        />
      </Field>
      <Field
        label="Bio (optional)"
        hint={`A line about your wall, printer, or what you like to climb. Up to ${BIO_MAX} characters.`}
      >
        <textarea
          name="bio"
          rows={3}
          maxLength={BIO_MAX}
          defaultValue={state.bio}
        />
      </Field>
      <FieldErrors errors={state.errors} />
      {state.saved && !state.errors.length && (
        <p className="success-box" role="status">
          Profile saved.
        </p>
      )}
      <button type="submit" className="button button-dark" disabled={pending}>
        {pending ? (
          <LoaderCircle size={16} className="spin" />
        ) : welcome ? (
          <ArrowUpRight size={16} />
        ) : null}{" "}
        {pending ? "Saving…" : welcome ? "Finish setup" : "Save profile"}
      </button>
    </form>
  );
}
