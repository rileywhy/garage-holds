"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { notifyOwner } from "@/lib/alerts";
import { loadCurrentUser } from "@/features/auth/current-user";
import { validateFeedback } from "./validation";

export interface FeedbackState {
  errors: string[];
  sent: boolean;
}

// Anyone may send feedback, signed in or not. Each message is stored and
// forwarded to the owner's webhook in one line. The "website" field is a
// honeypot: real people never see it, so a filled one is a bot.
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
  const errors = validateFeedback(input);
  if (errors.length) return { errors, sent: false };

  const user = isSupabaseConfigured()
    ? await loadCurrentUser(await createSupabaseServerClient())
    : null;
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
  await notifyOwner(
    `Feedback from ${from} on ${input.page || "an unknown page"}:\n${input.body}`,
  );
  return { errors: [], sent: true };
}
