"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import {
  deleteObject,
  headObject,
  isR2Configured,
  MODEL_CONTENT_TYPE,
  signUpload,
} from "@/lib/r2";
import { getUserId } from "@/features/holds/repository";
import {
  fileExtension,
  modelObjectKeys,
  objectKey,
} from "@/features/holds/rows";
import { MAX_MODEL_BYTES, MODEL_EXTENSIONS } from "@/features/holds/validation";
import type { PendingUpload, UploadFileDescriptor } from "./actions";
import { checkAllowance, limitMessage } from "./allowance";
import { makeModelPreview } from "./model-previews";
import { contactEmail, loadAllowance } from "./usage";

// Replacing one of a design's model files (RIL-24): the same signed-PUT
// round trip as a new upload. The new file gets a pending row beside the
// old one, is verified in R2 like any upload, and only then takes the old
// file's place, so the design keeps a verified model at every moment and
// a failed attempt leaves nothing behind. The old objects go after the
// row; one whose delete fails is swept later.

export type StartModelReplaceResult =
  { upload: PendingUpload } | { errors: string[] };

export type FinishModelReplaceResult =
  { replaced: true } | { errors: string[] };

export async function startModelReplace(
  designId: string,
  fileId: string,
  file: UploadFileDescriptor,
): Promise<StartModelReplaceResult> {
  if (!isR2Configured() || !isSupabaseAdminConfigured())
    return { errors: ["Uploads aren't configured in this environment yet."] };
  const supabase = await createSupabaseServerClient();
  const userId = await getUserId(supabase);
  if (!userId) return { errors: ["Sign in to edit your design."] };
  const current = await ownModelFile(supabase, userId, designId, fileId);
  if (!current) return { errors: ["This model file could not be found."] };

  const extension = fileExtension(file.name);
  const errors: string[] = [];
  if (!MODEL_EXTENSIONS.includes(extension))
    errors.push(`${file.name}: unsupported model format.`);
  if (!file.bytes || file.bytes > MAX_MODEL_BYTES)
    errors.push(`${file.name}: model files must be between 1 byte and 100 MB.`);
  if (errors.length) return { errors };

  // The old file still counts until the swap, so the allowance must hold
  // both for a moment, exactly as the database trigger will check it.
  const { usage, limits } = await loadAllowance(supabase, userId);
  const allowance = checkAllowance(usage, limits, {
    designs: 0,
    bytes: file.bytes,
  });
  if (!allowance.allowed)
    return { errors: [limitMessage(allowance.reason, limits, contactEmail())] };

  const id = crypto.randomUUID();
  const row = {
    id,
    design_id: designId,
    kind: "model" as const,
    object_key: objectKey(designId, id, extension),
    name: file.name,
    extension,
    bytes: file.bytes,
    position: current.position,
    status: "pending" as const,
    // How the previews turn it carries over; it can be set again after.
    orientation: current.orientation,
  };
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("design_files").insert(row);
  if (error) {
    console.error("model replace row insert failed", { designId, error });
    return { errors: ["Your file could not be registered. Try again."] };
  }
  return {
    upload: {
      fileId: id,
      name: row.name,
      url: await signUpload(row.object_key, {
        bytes: row.bytes,
        contentType: MODEL_CONTENT_TYPE,
      }),
      contentType: MODEL_CONTENT_TYPE,
    },
  };
}

export async function finishModelReplace(
  designId: string,
  fileId: string,
  newFileId: string,
): Promise<FinishModelReplaceResult> {
  if (!isR2Configured() || !isSupabaseAdminConfigured())
    return { errors: ["Uploads aren't configured in this environment yet."] };
  const supabase = await createSupabaseServerClient();
  const userId = await getUserId(supabase);
  if (!userId) return { errors: ["Sign in to edit your design."] };
  const [current, incoming] = await Promise.all([
    ownModelFile(supabase, userId, designId, fileId),
    ownModelFile(supabase, userId, designId, newFileId, "pending"),
  ]);
  if (!current || !incoming)
    return { errors: ["This model file could not be found."] };

  const admin = createSupabaseAdminClient();
  const object = await headObject(incoming.object_key);
  if (!object.exists || object.bytes !== incoming.bytes) {
    await admin.from("design_files").delete().eq("id", incoming.id);
    if (object.exists) await deleteObject(incoming.object_key);
    return {
      errors: [
        object.exists
          ? `${incoming.name} arrived with an unexpected size.`
          : `${incoming.name} did not finish uploading.`,
      ],
    };
  }
  const ready = await admin
    .from("design_files")
    .update({ status: "ready" })
    .eq("id", incoming.id);
  if (ready.error) {
    console.error("model replace ready update failed", {
      designId,
      error: ready.error,
    });
    return { errors: ["The new file could not be saved. Try again."] };
  }
  // The new file is live from here. The old row goes next; its objects
  // after, so a failure leaves orphans for the sweep rather than a card
  // pointing at nothing.
  const removed = await admin
    .from("design_files")
    .delete()
    .eq("id", current.id);
  if (removed.error) {
    console.error("model replace old row delete failed", {
      designId,
      error: removed.error,
    });
    return {
      errors: [
        "The new file is in place but the old one could not be removed. Try again.",
      ],
    };
  }
  for (const key of modelObjectKeys(current.object_key))
    await deleteObject(key);

  after(async () => {
    try {
      const previewKey = await makeModelPreview(incoming);
      if (previewKey)
        await admin
          .from("design_files")
          .update({ preview_object_key: previewKey })
          .eq("id", incoming.id);
    } catch (error) {
      console.error("model preview failed", { designId, incoming, error });
    }
  });
  revalidatePath("/");
  revalidatePath("/designs");
  revalidatePath(`/holds/${designId}`);
  revalidatePath(`/holds/${designId}/edit`);
  return { replaced: true };
}

// One of the signed-in person's own model files, through their client so
// row-level security is the authority on ownership.
async function ownModelFile(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  designId: string,
  fileId: string,
  status: "ready" | "pending" = "ready",
) {
  const { data } = await supabase
    .from("design_files")
    .select(
      "id, object_key, name, extension, bytes, position, orientation, kind, status, designs!inner(owner_id)",
    )
    .eq("id", fileId)
    .eq("design_id", designId)
    .eq("designs.owner_id", userId)
    .maybeSingle();
  return data && data.kind === "model" && data.status === status ? data : null;
}
