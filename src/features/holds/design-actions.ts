"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ACCOUNTS_NOT_CONFIGURED,
  isSupabaseConfigured,
} from "@/lib/supabase/config";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import { deleteObject, isR2Configured } from "@/lib/r2";
import { deletePhotoObjects } from "@/features/uploads/photo-sizes";
import { readDesignInput } from "./design-form";
import { modelObjectKeys } from "./rows";
import { getUserId } from "./repository";
import { validateDesign } from "./validation";
import { isOrientation } from "./orientation";

export interface EditDesignState {
  errors: string[];
}

// Metadata only: files and publication state are untouched. Row-level
// security limits the update to the owner's own row. The form adds any
// chosen photos after this and then navigates, so there is no redirect.
export async function updateDesign(
  designId: string,
  formData: FormData,
): Promise<EditDesignState> {
  const input = readDesignInput(formData);
  const errors = validateDesign(input);
  if (errors.length) return { errors };
  if (!isSupabaseConfigured()) return { errors: [ACCOUNTS_NOT_CONFIGURED] };
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
      design_method: input.designMethod,
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
  return { errors: [] };
}

export type DeleteDesignResult = { deleted: true } | { error: string };

// Deletes one of the user's own designs with everything attached to it.
// The row goes first through the user's client, so row-level security is
// the authority and the cascade removes files, reviews, and bookmarks in
// one step; the objects follow, and any that fail are swept later.
export async function deleteDesign(
  designId: string,
): Promise<DeleteDesignResult> {
  if (!isR2Configured() || !isSupabaseAdminConfigured())
    return { error: "Uploads aren't configured in this environment yet." };
  const supabase = await createSupabaseServerClient();
  const userId = await getUserId(supabase);
  if (!userId) return { error: "Sign in to delete your design." };
  const { data: design } = await supabase
    .from("designs")
    .select("id, design_files(object_key, kind)")
    .eq("id", designId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!design) return { error: "This design could not be found." };
  const { data: deleted, error } = await supabase
    .from("designs")
    .delete()
    .eq("id", designId)
    .eq("owner_id", userId)
    .select("id");
  if (error || !deleted?.length) {
    console.error("design delete failed", { userId, designId, error });
    return { error: "The design could not be deleted. Try again." };
  }
  for (const file of design.design_files)
    if (file.kind === "photo") await deletePhotoObjects(file.object_key);
    else
      for (const key of modelObjectKeys(file.object_key))
        await deleteObject(key);
  revalidatePath("/");
  revalidatePath("/designs");
  revalidatePath("/saved");
  return { deleted: true };
}

export type RemovePhotoResult = { removed: true } | { error: string };

// Removes one photo from the owner's own design. File rows are server-owned,
// so ownership is checked with the user's client first and the row and
// object go through the admin client: row first, so a failed object delete
// leaves an orphan for the sweep rather than a dangling row.
export async function removePhoto(
  designId: string,
  fileId: string,
): Promise<RemovePhotoResult> {
  if (!isR2Configured() || !isSupabaseAdminConfigured())
    return { error: "Uploads aren't configured in this environment yet." };
  const supabase = await createSupabaseServerClient();
  const userId = await getUserId(supabase);
  if (!userId) return { error: "Sign in to edit your design." };
  const { data: file } = await supabase
    .from("design_files")
    .select("id, object_key, kind, designs!inner(owner_id)")
    .eq("id", fileId)
    .eq("design_id", designId)
    .eq("designs.owner_id", userId)
    .maybeSingle();
  if (!file || file.kind !== "photo")
    return { error: "This photo could not be found." };
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("design_files").delete().eq("id", file.id);
  if (error) {
    console.error("photo removal failed", { designId, fileId, error });
    return { error: "The photo could not be removed. Try again." };
  }
  await deletePhotoObjects(file.object_key);
  revalidatePath("/");
  revalidatePath(`/holds/${designId}`);
  revalidatePath(`/holds/${designId}/edit`);
  return { removed: true };
}

export type OrientationResult = { saved: true } | { error: string };

// Stores how an uploaded model should face in previews, on the owner's own
// design. File rows are server-owned, so ownership is checked with the
// user's client first and the update goes through the admin client. The
// file itself is untouched.
export async function setFileOrientation(
  designId: string,
  fileId: string,
  orientation: string,
): Promise<OrientationResult> {
  if (!isOrientation(orientation))
    return { error: "That orientation is not valid." };
  if (!isSupabaseAdminConfigured())
    return { error: "Uploads aren't configured in this environment yet." };
  const supabase = await createSupabaseServerClient();
  const userId = await getUserId(supabase);
  if (!userId) return { error: "Sign in to edit your design." };
  const { data: file } = await supabase
    .from("design_files")
    .select("id, kind, designs!inner(owner_id)")
    .eq("id", fileId)
    .eq("design_id", designId)
    .eq("designs.owner_id", userId)
    .maybeSingle();
  if (!file || file.kind !== "model")
    return { error: "This model file could not be found." };
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("design_files")
    .update({ orientation })
    .eq("id", file.id);
  if (error) {
    console.error("orientation update failed", { designId, fileId, error });
    return { error: "The orientation could not be saved. Try again." };
  }
  revalidatePath("/");
  revalidatePath(`/holds/${designId}`);
  revalidatePath(`/holds/${designId}/edit`);
  return { saved: true };
}
