"use client";

import { useActionState } from "react";
import { LoaderCircle, MailCheck } from "lucide-react";
import { Field, FieldErrors } from "@/components/form-fields";
import {
  signInWithEmail,
  signInWithGoogle,
  type EmailSignInState,
} from "./actions";

const INITIAL: EmailSignInState = { step: "email", email: "", error: "" };

export function SignInForm({
  next,
  googleError,
}: {
  next: string;
  googleError: boolean;
}) {
  const [state, action, pending] = useActionState(signInWithEmail, INITIAL);
  return (
    <div className="sign-in-card">
      <form action={signInWithGoogle} className="sign-in-provider">
        <input type="hidden" name="next" value={next} />
        <button type="submit" className="button button-outline">
          <GoogleMark /> Continue with Google
        </button>
        {googleError && (
          <p className="error-box" role="alert">
            Google sign-in didn&apos;t complete. Try again or use an email code.
          </p>
        )}
      </form>
      <div className="sign-in-divider" role="separator">
        <span>or use an email code</span>
      </div>
      <form action={action} className="sign-in-email" aria-busy={pending}>
        <input type="hidden" name="next" value={next} />
        {state.step === "email" ? (
          <>
            <Field
              label="Email"
              hint="We’ll email you a one-time code. No password needed."
            >
              <input
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                defaultValue={state.email}
              />
            </Field>
            <FieldErrors errors={state.error ? [state.error] : []} />
            <button
              type="submit"
              name="intent"
              value="request"
              className="button button-dark"
              disabled={pending}
            >
              {pending ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <MailCheck size={16} />
              )}{" "}
              {pending ? "Sending code…" : "Email me a code"}
            </button>
          </>
        ) : (
          <>
            <p className="success-box" role="status">
              We sent a code to <strong>{state.email}</strong>. It expires in
              about an hour.
            </p>
            <Field label="One-time code">
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                required
                autoFocus
                maxLength={12}
              />
            </Field>
            <FieldErrors errors={state.error ? [state.error] : []} />
            <div className="sign-in-actions">
              <button
                type="submit"
                name="intent"
                value="verify"
                className="button button-dark"
                disabled={pending}
              >
                {pending && <LoaderCircle size={16} className="spin" />}{" "}
                {pending ? "Checking…" : "Sign in"}
              </button>
              <button
                type="submit"
                name="intent"
                value="restart"
                className="link-button"
                disabled={pending}
                formNoValidate
              >
                Use a different email
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l8 6.2C12.5 13.6 17.8 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.5c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.7-10.3 6.7-17.7z"
      />
      <path
        fill="#FBBC05"
        d="M10.6 28.6A14.6 14.6 0 0 1 9.8 24c0-1.6.3-3.1.8-4.6l-8-6.2A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l8-6.2z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.9l-8 6.2C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}
