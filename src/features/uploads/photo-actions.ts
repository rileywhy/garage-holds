"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import { deleteObject, headObject, isR2Configured, signUpload } from "@/lib/r2";
import { getUserId } from "@/features/holds/repository";
import {
  fileExtension,
  objectKey,
  photoContentType,
} from "@/features/holds/rows";
import { MAX_PHOTOS, validatePhotos } from "@/features/holds/validation";
import type { PendingUpload, UploadFileDescriptor } from "./actions";
import { checkAllowance, limitMessage } from "./allowance";
import { contactEmail, loadAllowance } from "./usage";

// Adding photos from the computer to a design that already exists: the same
// signed-PUT round trip as a new upload, limited to photos. Rows start
// pending, which readers ignore, and become visible once the objects are
// verified in finishPhotoUpload.

export type StartPhotoUploadResult =
  { uploads: PendingUpload[] } | { errors: string[] };

export interface FinishPhotoUploadResult {
  added: number;
  errors: string[];
}

export async function startPhotoUpload(
  designId: string,
  files: UploadFileDescriptor[],
): Promise<StartPhotoUploadResult> {
  if (!isR2Configured() || !isSupabaseAdminConfigured())
    return { errors: ["Uploads aren't configured in this environment yet."] };
  const supabase = await createSupabaseServerClient();
  const userId = await getUserId(supabase);
  if (!userId) return { errors: ["Sign in to add photos."] };
  const { data: design } = await supabase
    .from("designs")
    .select("id, design_files(kind, position)")
    .eq("id", designId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!design) return { errors: ["This design could not be found."] };
  const photos = files.filter((file) => file.kind === "photo");
  if (!photos.length) return { errors: ["Choose at least one photo."] };
  const errors = validatePhotos(
    photos.map((file) => ({
      name: file.name,
      size: file.bytes,
      type: file.type,
    })),
  );
  // Photos are served by extension, so the extension must be an image type
  // regardless of what the browser claimed.
  for (const photo of photos)
    if (!photoContentType(fileExtension(photo.name)))
      errors.push(`${photo.name}: photos must be .jpg, .png, or .webp files.`);
  const existing = design.design_files.filter((file) => file.kind === "photo");
  if (existing.length + photos.length > MAX_PHOTOS)
    errors.push(
      `A design can have up to ${MAX_PHOTOS} photos; this one has ${existing.length}.`,
    );
  if (errors.length) return { errors };

  const { usage, limits } = await loadAllowance(supabase, userId);
  const allowance = checkAllowance(usage, limits, {
    designs: 0,
    bytes: photos.reduce((sum, photo) => sum + photo.bytes, 0),
  });
  if (!allowance.allowed)
    return { errors: [limitMessage(allowance.reason, limits, contactEmail())] };

  const nextPosition =
    design.design_files.reduce(
      (max, file) => Math.max(max, file.position),
      -1,
    ) + 1;
  const rows = photos.map((file, index) => {
    const id = crypto.randomUUID();
    const extension = fileExtension(file.name);
    return {
      id,
      design_id: designId,
      kind: "photo" as const,
      object_key: objectKey(designId, id, extension),
      name: file.name,
      extension,
      bytes: file.bytes,
      position: nextPosition + index,
      status: "pending" as const,
    };
  });
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("design_files").insert(rows);
  if (error) {
    console.error("photo rows insert failed", { designId, error });
    return { errors: ["Your photos could not be registered. Try again."] };
  }
  const uploads = await Promise.all(
    rows.map(async (row) => ({
      fileId: row.id,
      name: row.name,
      url: await signUpload(row.object_key),
    })),
  );
  return { uploads };
}

// Verifies each pending photo the way publishing does: present in R2 with
// the declared size. Anything that did not arrive is removed again, so a
// failed attempt leaves nothing behind.
export async function finishPhotoUpload(
  designId: string,
  fileIds: string[],
): Promise<FinishPhotoUploadResult> {
  if (!isR2Configured() || !isSupabaseAdminConfigured())
    return {
      added: 0,
      errors: ["Uploads aren't configured in this environment yet."],
    };
  const supabase = await createSupabaseServerClient();
  const userId = await getUserId(supabase);
  if (!userId) return { added: 0, errors: ["Sign in to add photos."] };
  const { data: design } = await supabase
    .from("designs")
    .select("id")
    .eq("id", designId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!design) return { added: 0, errors: ["This design could not be found."] };
  if (!fileIds.length) return { added: 0, errors: [] };

  const admin = createSupabaseAdminClient();
  const { data: files } = await admin
    .from("design_files")
    .select("id, object_key, name, bytes, status")
    .eq("design_id", designId)
    .eq("kind", "photo")
    .in("id", fileIds);
  const errors: string[] = [];
  let added = 0;
  for (const file of files ?? []) {
    if (file.status === "ready") continue;
    const object = await headObject(file.object_key);
    if (!object.exists) {
      errors.push(`${file.name} did not finish uploading.`);
      await admin.from("design_files").delete().eq("id", file.id);
      continue;
    }
    if (object.bytes !== file.bytes) {
      errors.push(`${file.name} arrived with an unexpected size.`);
      await admin.from("design_files").delete().eq("id", file.id);
      await deleteObject(file.object_key);
      continue;
    }
    const { error } = await admin
      .from("design_files")
      .update({ status: "ready" })
      .eq("id", file.id);
    if (error) {
      console.error("photo ready update failed", { designId, file, error });
      errors.push(`${file.name} could not be saved. Try again.`);
      continue;
    }
    added += 1;
  }
  if (added) {
    revalidatePath("/");
    revalidatePath(`/holds/${designId}`);
    revalidatePath(`/holds/${designId}/edit`);
  }
  return { added, errors };
}
