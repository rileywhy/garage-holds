"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/request-origin";
import {
  normalizeBio,
  normalizeDisplayName,
  validateBio,
  validateDisplayName,
} from "@/features/profiles/validation";
import { loadCurrentUser } from "./current-user";
import { postSignInPath, safeNextPath, signInPath } from "./redirects";

export interface EmailSignInState {
  step: "email" | "code";
  email: string;
  error: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// One action drives both steps of the email-code flow so the form keeps a
// single piece of state: which step it is on, for which address.
export async function signInWithEmail(
  previous: EmailSignInState,
  formData: FormData,
): Promise<EmailSignInState> {
  const intent = String(formData.get("intent") ?? "");
  if (intent === "restart") return { step: "email", email: "", error: "" };
  const supabase = await createSupabaseServerClient();

  if (intent === "request") {
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    if (!EMAIL_PATTERN.test(email))
      return { step: "email", email, error: "Enter a valid email address." };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error)
      return {
        step: "email",
        email,
        error: friendlyAuthError(error.message, "We couldn't send a code."),
      };
    return { step: "code", email, error: "" };
  }

  if (intent === "verify") {
    const token = String(formData.get("code") ?? "").replace(/\s+/g, "");
    if (!/^\d{6,10}$/.test(token))
      return {
        ...previous,
        step: "code",
        error: "Enter the code from your email.",
      };
    const { error } = await supabase.auth.verifyOtp({
      email: previous.email,
      token,
      type: "email",
    });
    if (error)
      return {
        ...previous,
        step: "code",
        error: friendlyAuthError(
          error.message,
          "That code didn't work. Check it or request a new one.",
        ),
      };
    const user = await loadCurrentUser(supabase);
    redirect(
      postSignInPath(user?.onboarded ?? true, String(formData.get("next"))),
    );
  }

  return previous;
}

export async function signInWithGoogle(formData: FormData) {
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const supabase = await createSupabaseServerClient();
  const origin = await requestOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error || !data.url) redirect(`${signInPath(next)}&error=google`);
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export interface ProfileFormState {
  displayName: string;
  bio: string;
  errors: string[];
  saved: boolean;
}

// Serves both the first-run welcome page and later edits on /account. The
// first successful save marks the profile as set up; a welcome submission
// then continues to the user's original destination.
export async function saveProfile(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const displayName = normalizeDisplayName(
    String(formData.get("displayName") ?? ""),
  );
  const bio = normalizeBio(String(formData.get("bio") ?? ""));
  const errors = [...validateDisplayName(displayName), ...validateBio(bio)];
  if (errors.length) return { displayName, bio, errors, saved: false };

  const supabase = await createSupabaseServerClient();
  const user = await loadCurrentUser(supabase);
  if (!user) redirect(signInPath("/account"));
  // Row-level security limits the update to the caller's own row; the filter
  // keeps the intent explicit and avoids a silent no-op.
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      bio,
      ...(user.onboarded ? {} : { onboarded_at: new Date().toISOString() }),
    })
    .eq("id", user.id);
  if (error)
    return {
      displayName,
      bio,
      errors: [
        error.code === "23505"
          ? "That display name is taken. Try another."
          : "Your profile could not be saved. Try again.",
      ],
      saved: false,
    };
  revalidatePath("/", "layout");
  const next = formData.get("next");
  if (typeof next === "string") redirect(safeNextPath(next));
  return { displayName, bio, errors: [], saved: true };
}

function friendlyAuthError(message: string, fallback: string) {
  const lower = message.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("too many"))
    return "Too many attempts. Wait a few minutes and try again.";
  if (lower.includes("expired"))
    return "That code has expired. Request a new one.";
  return fallback;
}
