"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ACCOUNTS_NOT_CONFIGURED,
  isSupabaseConfigured,
} from "@/lib/supabase/config";
import { getUserId } from "@/features/holds/repository";
import { validateReview } from "@/features/holds/validation";
import { optionalNumber } from "@/lib/form-data";

export interface ReviewFormState {
  errors: string[];
  saved: boolean;
}

// One review per person per design: a second submission updates the first.
export async function submitReview(
  _previous: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const designId = text("designId");
  const input = {
    rating: Number(text("rating")),
    text: text("text"),
    material: text("material"),
    printSettings: text("printSettings"),
    postProcessing: text("postProcessing"),
    problemGrade: optionalNumber(formData.get("problemGrade")),
  };
  const errors = validateReview(input);
  if (errors.length) return { errors, saved: false };
  if (!isSupabaseConfigured())
    return { errors: [ACCOUNTS_NOT_CONFIGURED], saved: false };

  const supabase = await createSupabaseServerClient();
  const userId = await getUserId(supabase);
  if (!userId) return { errors: ["Sign in to leave a review."], saved: false };
  const values = {
    rating: input.rating,
    body: input.text,
    material: input.material,
    print_settings: input.printSettings,
    post_processing: input.postProcessing,
    problem_grade: input.problemGrade,
  };
  // Explicit insert-or-update rather than upsert: the update grant covers only
  // the review's content columns, never its design or author.
  const { data: existing } = await supabase
    .from("reviews")
    .select("id")
    .eq("design_id", designId)
    .eq("author_id", userId)
    .maybeSingle<{ id: string }>();
  const { error } = existing
    ? await supabase.from("reviews").update(values).eq("id", existing.id)
    : await supabase
        .from("reviews")
        .insert({ design_id: designId, author_id: userId, ...values });
  if (error) {
    console.error("review save failed", { userId, designId, error });
    return {
      errors: [
        error.code === "42501"
          ? "Reviews are only open on published designs."
          : "Your review could not be saved. Try again.",
      ],
      saved: false,
    };
  }
  revalidatePath(`/holds/${designId}`);
  revalidatePath("/");
  return { errors: [], saved: true };
}
