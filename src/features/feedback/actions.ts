"use server";

import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { notifyOwner, notifyOwnerOnce } from "@/lib/alerts";
import {
  clientErrorKey,
  formatClientError,
  validateClientReport,
} from "@/lib/error-reports";
import { loadCurrentUser } from "@/features/auth/current-user";
import { createRateLimiter } from "@/lib/rate-limit";
import { spamVerdict } from "./spam";
import { validateFeedback } from "./validation";

export interface FeedbackState {
  errors: string[];
  sent: boolean;
}

// A person gets a handful of messages per quarter hour; the site as a whole
// gets a ceiling too, so a script cycling addresses still cannot flood the
// owner's channel. Both are per server instance, which is enough here.
const PER_SENDER_WINDOW_MS = 15 * 60 * 1000;
const allowSender = createRateLimiter(4, PER_SENDER_WINDOW_MS);
const allowAnyone = createRateLimiter(40, PER_SENDER_WINDOW_MS);
const TOO_MANY =
  "You have sent a few messages in a row. Wait a while and try again.";

// Anyone may send feedback, signed in or not. Each message is stored and
// forwarded to the owner's webhook in one line. The "website" field is a
// honeypot: real people never see it, so a filled one is a bot. A message
// posted without the widget is dropped the same way, and a sales pitch is
// stored but not forwarded (see spam.ts). Both get the usual "Sent".
export async function submitFeedback(
  _previous: FeedbackState,
  formData: FormData,
): Promise<FeedbackState> {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  if (text("website")) return { errors: [], sent: true };
  const input = {
    body: text("body"),
    contact: text("contact"),
    page: text("page"),
  };
  const verdict = spamVerdict(input);
  if (verdict === "bot") return { errors: [], sent: true };
  const errors = validateFeedback(input);
  if (errors.length) return { errors, sent: false };

  const user = isSupabaseConfigured()
    ? await loadCurrentUser(await createSupabaseServerClient())
    : null;
  const sender = user ? `user:${user.id}` : `ip:${await requestIp()}`;
  if (!allowSender(sender) || !allowAnyone("all"))
    return { errors: [TOO_MANY], sent: false };
  if (isSupabaseAdminConfigured()) {
    const { error } = await createSupabaseAdminClient()
      .from("feedback")
      .insert({
        author_id: user?.id ?? null,
        contact: input.contact,
        page: input.page,
        body: input.body,
      });
    if (error) {
      console.error("feedback insert failed", error);
      return {
        errors: ["Your message could not be sent. Try again in a moment."],
        sent: false,
      };
    }
  }
  const from = user
    ? `${user.displayName} (${user.email})`
    : input.contact || "a visitor";
  if (verdict !== "pitch")
    await notifyOwner(`Feedback from ${from} on ${input.page}:\n${input.body}`);
  return { errors: [], sent: true };
}

// The caller's address as the proxy reports it; Vercel sets both headers.
// Unknown callers share one bucket, which the site-wide ceiling covers.
async function requestIp() {
  const list = await headers();
  return (
    list.get("x-real-ip") ??
    list.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}

// Error reports get a smaller allowance than feedback: a real visitor's
// page fails a few times at most, while a script choosing its own digest
// would otherwise get a fresh line through the dedupe on every call.
const allowReporter = createRateLimiter(5, PER_SENDER_WINDOW_MS);
const allowAnyReport = createRateLimiter(30, PER_SENDER_WINDOW_MS);

// Called once by the error boundary when a page fails in the browser. The
// report is whatever the browser sent, so it is validated, flattened to one
// plain line and redacted to the route template here, and never stored; the
// owner gets one line per distinct error per minute, within the allowances
// above. Refused reports are dropped silently: the browser has nothing to
// do about them.
export async function reportClientError(input: unknown): Promise<void> {
  const report = validateClientReport(input);
  if (!report) return;
  if (!allowReporter(`ip:${await requestIp()}`) || !allowAnyReport("all"))
    return;
  await notifyOwnerOnce(clientErrorKey(report), formatClientError(report));
}
