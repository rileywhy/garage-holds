"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import sharp from "sharp";
import {
  getObject,
  isR2Configured,
  MODEL_CONTENT_TYPE,
  putObject,
  signUpload,
} from "@/lib/r2";
import { getUserId } from "@/features/holds/repository";
import {
  fileExtension,
  objectKey,
  photoContentType,
} from "@/features/holds/rows";
import { MAX_PHOTOS, validatePhotos } from "@/features/holds/validation";
import type { PendingUpload, UploadFileDescriptor } from "./actions";
import { normalizeCrop, type CropRect } from "./crop";
import { createPhotoSizes, deletePhotoObjects } from "./photo-sizes";
import { bucket } from "./bucket";
import { verifyPendingFiles, type PendingFile } from "./verification";
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
    rows.map(async (row) => {
      const contentType = photoContentType(row.extension) ?? MODEL_CONTENT_TYPE;
      return {
        fileId: row.id,
        name: row.name,
        url: await signUpload(row.object_key, {
          bytes: row.bytes,
          contentType,
        }),
        contentType,
      };
    }),
  );
  return { uploads };
}

// Verifies each pending photo the way publishing does (verification.ts).
// Anything that did not arrive intact is removed again, so a failed attempt
// leaves nothing behind.
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
    .select("id, object_key, name, extension, bytes, kind, status")
    .eq("design_id", designId)
    .eq("kind", "photo")
    .in("id", fileIds);
  const { ready: added, errors } = await verifyPendingFiles(
    admin,
    bucket,
    (files ?? []) as PendingFile[],
  );
  if (added) {
    revalidatePath("/");
    revalidatePath(`/holds/${designId}`);
    revalidatePath(`/holds/${designId}/edit`);
  }
  return { added, errors };
}

export type CropPhotoResult = { cropped: true } | { error: string };

// Crops a stored photo of the owner's own design to the rectangle chosen in
// the cropper, in the photo's displayed (orientation-corrected) pixels. The
// result is written as a new object before the row moves to it, so a
// failure leaves the photo as it was; the old object goes last.
export async function cropPhoto(
  designId: string,
  fileId: string,
  rect: CropRect,
): Promise<CropPhotoResult> {
  if (!isR2Configured() || !isSupabaseAdminConfigured())
    return { error: "Uploads aren't configured in this environment yet." };
  const supabase = await createSupabaseServerClient();
  const userId = await getUserId(supabase);
  if (!userId) return { error: "Sign in to edit your design." };
  const { data: file } = await supabase
    .from("design_files")
    .select("id, object_key, extension, kind, status, designs!inner(owner_id)")
    .eq("id", fileId)
    .eq("design_id", designId)
    .eq("designs.owner_id", userId)
    .maybeSingle();
  if (!file || file.kind !== "photo" || file.status !== "ready")
    return { error: "This photo could not be found." };
  const contentType = photoContentType(file.extension);
  if (!contentType) return { error: "This photo cannot be cropped." };

  try {
    const original = await getObject(file.object_key);
    // Browsers display photos the way their orientation tag says, and the
    // cropper measured against that; rotate() bakes the tag in so the
    // rectangle lines up.
    const image = sharp(original).rotate();
    const meta = await sharp(original).metadata();
    const swap = (meta.orientation ?? 1) >= 5;
    const width = swap ? meta.height : meta.width;
    const height = swap ? meta.width : meta.height;
    const crop = normalizeCrop(rect, width, height);
    if (!crop) return { error: "Choose a smaller area to crop to." };
    const cropped = image.extract(crop);
    const output =
      contentType === "image/png"
        ? cropped.png()
        : contentType === "image/webp"
          ? cropped.webp({ quality: 90 })
          : cropped.jpeg({ quality: 90 });
    const bytes = new Uint8Array(await output.toBuffer());
    const key = objectKey(designId, crypto.randomUUID(), file.extension);
    await putObject(key, bytes, contentType);
    const sized = await createPhotoSizes(key, file.extension);
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("design_files")
      .update({ object_key: key, bytes: sized ?? bytes.byteLength })
      .eq("id", file.id);
    if (error) {
      await deletePhotoObjects(key);
      console.error("crop row update failed", { designId, fileId, error });
      return { error: "The crop could not be saved. Try again." };
    }
    await deletePhotoObjects(file.object_key);
  } catch (error) {
    console.error("crop failed", { designId, fileId, error });
    return { error: "The photo could not be cropped. Try again." };
  }
  revalidatePath("/");
  revalidatePath(`/holds/${designId}`);
  revalidatePath(`/holds/${designId}/edit`);
  return { cropped: true };
}
