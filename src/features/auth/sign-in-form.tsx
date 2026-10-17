"use client";

import { useActionState } from "react";
import { LoaderCircle, MailCheck } from "lucide-react";
import { Field, FieldErrors } from "@/components/form-fields";
import { trackEvent } from "@/features/analytics/events";
import { signInWithEmail, type EmailSignInState } from "./actions";
import { GoogleSignIn } from "./google-sign-in";

const INITIAL: EmailSignInState = { step: "email", email: "", error: "" };

// Google appears only where a Google client ID is configured; email codes
// work wherever Supabase does.
export function SignInForm({
  next,
  googleClientId,
}: {
  next: string;
  googleClientId: string | null;
}) {
  const [state, action, pending] = useActionState(signInWithEmail, INITIAL);
  return (
    <div className="sign-in-card">
      {googleClientId && (
        <>
          <div className="sign-in-provider">
            <GoogleSignIn clientId={googleClientId} next={next} />
          </div>
          <div className="sign-in-divider" role="separator">
            <span>or use an email code</span>
          </div>
        </>
      )}
      <form
        action={action}
        className="sign-in-email"
        aria-busy={pending}
        onSubmit={() => {
          // Counted when the code is requested, not again when it is entered.
          if (state.step === "email")
            trackEvent({ name: "sign_in", method: "email" });
        }}
      >
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
              ten minutes.
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
