"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readDesignInput } from "./design-form";
import { getUserId } from "./repository";
import { validateDesign } from "./validation";

export interface EditDesignState {
  errors: string[];
}

// Metadata only: files and publication state are untouched. Row-level
// security limits the update to the owner's own row.
export async function updateDesign(
  designId: string,
  _previous: EditDesignState,
  formData: FormData,
): Promise<EditDesignState> {
  const input = readDesignInput(formData);
  const errors = validateDesign(input);
  if (errors.length) return { errors };
  const supabase = await createSupabaseServerClient();
  const userId = await getUserId(supabase);
  if (!userId) return { errors: ["Sign in to edit your design."] };
  const recipe = input.recipes[0];
  const { data, error } = await supabase
    .from("designs")
    .update({
      title: input.title,
      description: input.description,
      hold_type: input.type,
      size: input.size,
      mounting: input.mount,
      problem_grade: input.problemGrade,
      tags: input.tags,
      license: input.license,
      material: recipe.material,
      special_process: recipe.specialProcess,
      print_notes: recipe.notes,
      texture_notes: recipe.textureNotes,
      post_processing: recipe.postProcessing,
    })
    .eq("id", designId)
    .eq("owner_id", userId)
    .select("id");
  if (error || !data?.length) {
    console.error("design update failed", { userId, designId, error });
    return {
      errors: [
        error
          ? "Your changes could not be saved. Try again."
          : "Only the creator can edit this design.",
      ],
    };
  }
  revalidatePath("/");
  revalidatePath(`/holds/${designId}`);
  revalidatePath("/designs");
  redirect(`/holds/${designId}`);
}
