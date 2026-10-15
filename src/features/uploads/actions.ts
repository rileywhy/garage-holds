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
import { validateUpload } from "@/features/holds/validation";
import {
  DEFAULT_ORIENTATION,
  isOrientation,
} from "@/features/holds/orientation";
import type { DesignInput } from "@/features/holds/types";
import {
  asUploadFile as inboxAsUploadFile,
  attachInboxPhotos,
  ownInboxPhotos,
} from "./phone-photos";
import {
  createPhotoSizes,
  deletePhotoObjects,
  UnreadablePhotoError,
} from "./photo-sizes";
import { checkAllowance, isNearLimit, limitMessage } from "./allowance";
import { contactEmail, loadAllowance } from "./usage";
import { notifyOwner } from "@/lib/alerts";

export interface UploadFileDescriptor {
  kind: "model" | "photo";
  name: string;
  bytes: number;
  type: string;
  // Models only: how previews turn the file (see holds/orientation.ts).
  orientation?: string;
}

export interface PendingUpload {
  fileId: string;
  name: string;
  url: string;
}

export type CreateDraftResult =
  { designId: string; uploads: PendingUpload[] } | { errors: string[] };

export type FinalizeResult = { designId: string } | { errors: string[] };

// Step 1 of 3: validate, create the draft, reserve object keys, and hand the
// browser one signed PUT URL per file. Nothing is public yet. Photos already
// handed over from a phone are validated here and attached at publish time.
export async function createDraft(
  input: DesignInput,
  files: UploadFileDescriptor[],
  sharingPermission: boolean,
  phonePhotoIds: string[] = [],
): Promise<CreateDraftResult> {
  if (!isR2Configured() || !isSupabaseAdminConfigured())
    return { errors: ["Uploads aren't configured in this environment yet."] };
  const supabase = await createSupabaseServerClient();
  const userId = await getUserId(supabase);
  if (!userId) return { errors: ["Sign in to upload a design."] };

  const models = files.filter((file) => file.kind === "model");
  const photos = files.filter((file) => file.kind === "photo");
  const phonePhotos = await ownInboxPhotos(supabase, phonePhotoIds);
  const errors = validateUpload(
    input,
    models.map(asUploadFile),
    [...photos.map(asUploadFile), ...phonePhotos.map(inboxAsUploadFile)],
    sharingPermission,
  );
  // Photos are served by extension, so the extension must be an image type
  // regardless of what the browser claimed.
  for (const photo of photos)
    if (!photoContentType(fileExtension(photo.name)))
      errors.push(`${photo.name}: photos must be .jpg, .png, or .webp files.`);
  if (phonePhotos.length < phonePhotoIds.length)
    errors.push("Some phone photos are no longer available. Scan again.");
  for (const model of models)
    if (model.orientation !== undefined && !isOrientation(model.orientation))
      errors.push(`${model.name}: the orientation is not valid.`);
  if (errors.length) return { errors };

  // The account's allowance, checked before anything is written. A refusal
  // also tells the owner, who can raise the limit for a real contributor.
  const { usage, limits } = await loadAllowance(supabase, userId);
  const incomingBytes =
    files.reduce((sum, file) => sum + file.bytes, 0) +
    phonePhotos.reduce((sum, photo) => sum + photo.bytes, 0);
  const allowance = checkAllowance(usage, limits, {
    designs: 1,
    bytes: incomingBytes,
  });
  if (!allowance.allowed) {
    await notifyOwner(
      `Upload refused: user ${userId} is at the ${allowance.reason} limit (${usage.designs}/${limits.designs} designs, ${usage.bytes}/${limits.bytes} bytes) and tried to upload "${input.title}".`,
    );
    return { errors: [limitMessage(allowance.reason, limits, contactEmail())] };
  }

  const recipe = input.recipes[0];
  const { data: design, error } = await supabase
    .from("designs")
    .insert({
      owner_id: userId,
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
    .select("id")
    .single<{ id: string }>();
  if (error || !design) {
    console.error("draft insert failed", { userId, error });
    return { errors: ["Your design could not be saved. Try again."] };
  }

  const rows = files.map((file, index) => {
    const id = crypto.randomUUID();
    const extension = fileExtension(file.name);
    return {
      id,
      design_id: design.id,
      kind: file.kind,
      object_key: objectKey(design.id, id, extension),
      name: file.name,
      extension,
      bytes: file.bytes,
      position: index,
      status: "pending" as const,
      orientation:
        file.kind === "model" && file.orientation
          ? file.orientation
          : DEFAULT_ORIENTATION,
    };
  });
  const admin = createSupabaseAdminClient();
  const { error: fileError } = await admin.from("design_files").insert(rows);
  if (fileError) {
    console.error("file rows insert failed", {
      designId: design.id,
      fileError,
    });
    await supabase.from("designs").delete().eq("id", design.id);
    return { errors: ["Your files could not be registered. Try again."] };
  }
  const uploads = await Promise.all(
    rows.map(async (row) => ({
      fileId: row.id,
      name: row.name,
      url: await signUpload(row.object_key),
    })),
  );
  return { designId: design.id, uploads };
}

// Step 3 of 3: confirm every object landed in R2 with the declared size, mark
// the files ready, attach any phone photos, and publish. The database refuses
// to publish without a verified model file, so this is the only path to a
// public design.
export async function finalizeDesign(
  designId: string,
  phonePhotoIds: string[] = [],
): Promise<FinalizeResult> {
  const supabase = await createSupabaseServerClient();
  const userId = await getUserId(supabase);
  if (!userId) return { errors: ["Sign in to publish a design."] };
  const { data: design } = await supabase
    .from("designs")
    .select("id, owner_id, status")
    .eq("id", designId)
    .maybeSingle<{ id: string; owner_id: string; status: string }>();
  if (!design || design.owner_id !== userId)
    return { errors: ["This draft could not be found."] };

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("design_files")
    .select("id, object_key, name, bytes, kind, status")
    .eq("design_id", designId);
  const files = (data ?? []) as {
    id: string;
    object_key: string;
    name: string;
    bytes: number;
    kind: "model" | "photo";
    status: "pending" | "ready";
  }[];
  const errors: string[] = [];
  for (const file of files) {
    if (file.status === "ready") continue;
    const object = await headObject(file.object_key);
    if (!object.exists) {
      errors.push(`${file.name} did not finish uploading.`);
      continue;
    }
    if (object.bytes !== file.bytes) {
      errors.push(`${file.name} arrived with an unexpected size.`);
      await deleteObject(file.object_key);
      await admin.from("design_files").delete().eq("id", file.id);
      continue;
    }
    // A photo's sizes come first: making them reads the bytes, so a file
    // that is not an image is refused here instead of becoming a ready row.
    if (file.kind === "photo")
      try {
        await createPhotoSizes(file.object_key, fileExtension(file.name));
      } catch (error) {
        errors.push(
          error instanceof UnreadablePhotoError
            ? `${file.name} is not a readable image.`
            : `${file.name} could not be prepared. Try again.`,
        );
        if (!(error instanceof UnreadablePhotoError))
          console.error("photo sizes failed", { designId, file, error });
        await deletePhotoObjects(file.object_key);
        await admin.from("design_files").delete().eq("id", file.id);
        continue;
      }
    await admin
      .from("design_files")
      .update({ status: "ready" })
      .eq("id", file.id);
  }
  if (errors.length) return { errors };

  const phonePhotos = await ownInboxPhotos(supabase, phonePhotoIds);
  if (phonePhotos.length < phonePhotoIds.length)
    return {
      errors: ["Some phone photos are no longer available. Scan again."],
    };
  try {
    await attachInboxPhotos(admin, designId, phonePhotos, files.length);
  } catch (error) {
    console.error("attach phone photos failed", { designId, error });
    return { errors: ["Your phone photos could not be attached. Try again."] };
  }

  const { error } = await supabase
    .from("designs")
    .update({ status: "published" })
    .eq("id", designId);
  if (error) {
    console.error("publish failed", { designId, error });
    return {
      errors: ["Your files were saved but publishing failed. Try again."],
    };
  }
  revalidatePath("/");
  await warnWhenNearLimit(supabase, userId);
  return { designId };
}

// Tells the owner once, when a publish takes the account over 80% of a
// limit, so the allowance can be raised before the uploader runs into it.
async function warnWhenNearLimit(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
) {
  const { usage, limits } = await loadAllowance(supabase, userId);
  if (!isNearLimit(usage, limits)) return;
  const { data: last } = await supabase
    .from("designs")
    .select("design_files(bytes)")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastBytes =
    last?.design_files.reduce((sum, file) => sum + file.bytes, 0) ?? 0;
  const before = {
    designs: usage.designs - 1,
    bytes: usage.bytes - lastBytes,
  };
  if (isNearLimit(before, limits)) return;
  await notifyOwner(
    `Heads up: user ${userId} is at ${usage.designs}/${limits.designs} designs and ${usage.bytes}/${limits.bytes} bytes. Raise their allowance if the designs are good.`,
  );
}

// Called by the browser when an upload fails after the draft was created, so
// a failed attempt leaves nothing behind. Only the owner's own draft can go;
// published designs are never touched here.
export async function abandonDraft(designId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const userId = await getUserId(supabase);
  if (!userId) return;
  const { data: design } = await supabase
    .from("designs")
    .select("id, status")
    .eq("id", designId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!design || design.status !== "draft") return;

  const admin = createSupabaseAdminClient();
  const { data: files } = await admin
    .from("design_files")
    .select("object_key, kind")
    .eq("design_id", designId);
  // Objects first; a failure here leaves the rows for the sweep to retry.
  for (const file of files ?? [])
    if (file.kind === "photo") await deletePhotoObjects(file.object_key);
    else await deleteObject(file.object_key);
  const { error } = await supabase
    .from("designs")
    .delete()
    .eq("id", designId)
    .eq("status", "draft");
  if (error) console.error("abandon draft failed", { designId, error });
}

function asUploadFile(file: UploadFileDescriptor) {
  return { name: file.name, size: file.bytes, type: file.type };
}
