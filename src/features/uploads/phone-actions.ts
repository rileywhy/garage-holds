"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import { isR2Configured, signImage, signUpload } from "@/lib/r2";
import { requestOrigin } from "@/lib/request-origin";
import { getUserId } from "@/features/holds/repository";
import { photoContentType } from "@/features/holds/rows";
import { MAX_PHOTOS } from "@/features/holds/validation";
import {
  attachInboxPhotos,
  ownInboxPhotos,
  reservePhonePhoto,
  verifyPhonePhoto,
} from "./phone-photos";
import { bucket } from "./bucket";
import { checkAllowance, limitMessage } from "./allowance";
import { contactEmail, loadAllowance } from "./usage";

// The phone hand-off. The signed-in desktop starts a session and shows its
// URL as a QR code; the phone opens it and uploads photos without signing
// in, the session id being the only credential; the desktop polls for what
// arrived. Phone-side actions therefore look the session up with the
// service role and never trust anything else from the request (see
// phone-photos.ts).

export interface PhonePhoto {
  id: string;
  name: string;
  bytes: number;
  // Short-lived signed URL for the thumbnail.
  url: string;
}

export type StartSessionResult =
  { sessionId: string; url: string; expiresAt: string } | { error: string };

export async function startPhoneSession(
  designId?: string,
): Promise<StartSessionResult> {
  if (!isR2Configured() || !isSupabaseAdminConfigured())
    return { error: "Uploads aren't configured in this environment yet." };
  const supabase = await createSupabaseServerClient();
  const userId = await getUserId(supabase);
  if (!userId) return { error: "Sign in to add photos from your phone." };
  const { data, error } = await supabase
    .from("phone_sessions")
    .insert({ owner_id: userId, design_id: designId ?? null })
    .select("id, expires_at")
    .single();
  if (error || !data) {
    console.error("phone session insert failed", { userId, error });
    return { error: "Could not start a phone session. Try again." };
  }
  return {
    sessionId: data.id,
    url: `${await requestOrigin()}/phone/${data.id}`,
    expiresAt: data.expires_at,
  };
}

// Desktop side: what has arrived so far, as the signed-in owner.
export async function listPhonePhotos(
  sessionId: string,
): Promise<PhonePhoto[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("phone_photos")
    .select("id, name, bytes, extension, object_key")
    .eq("session_id", sessionId)
    .eq("status", "ready")
    .order("created_at");
  return Promise.all(
    (data ?? []).map(async (photo) => ({
      id: photo.id,
      name: photo.name,
      bytes: photo.bytes,
      url: await signImage(
        photo.object_key,
        photoContentType(photo.extension) ?? "application/octet-stream",
      ),
    })),
  );
}

export type SignPhotoResult =
  { photoId: string; url: string; contentType: string } | { error: string };

// Phone side, step 1: reserve a slot and sign one PUT URL.
export async function signPhonePhoto(
  sessionId: string,
  file: { name: string; bytes: number; type: string },
): Promise<SignPhotoResult> {
  if (!isR2Configured() || !isSupabaseAdminConfigured())
    return { error: "Uploads aren't configured in this environment yet." };
  const reserved = await reservePhonePhoto(
    createSupabaseAdminClient(),
    sessionId,
    file,
  );
  if ("error" in reserved) return reserved;
  return {
    photoId: reserved.photoId,
    url: await signUpload(reserved.objectKey, {
      bytes: file.bytes,
      contentType: reserved.contentType,
    }),
    contentType: reserved.contentType,
  };
}

// Phone side, step 2: confirm the object landed with the declared size.
export async function confirmPhonePhoto(
  sessionId: string,
  photoId: string,
): Promise<{ ok: true } | { error: string }> {
  if (!isR2Configured() || !isSupabaseAdminConfigured())
    return { error: "Uploads aren't configured in this environment yet." };
  return verifyPhonePhoto(
    createSupabaseAdminClient(),
    bucket,
    sessionId,
    photoId,
  );
}

export type AttachResult = { added: number } | { errors: string[] };

// Edit page: attach inbox photos to a design that already exists.
export async function attachPhonePhotos(
  designId: string,
  photoIds: string[],
): Promise<AttachResult> {
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
  const photos = await ownInboxPhotos(supabase, photoIds);
  if (!photos.length) return { errors: ["Choose at least one photo."] };
  const existing = design.design_files.filter((file) => file.kind === "photo");
  if (existing.length + photos.length > MAX_PHOTOS)
    return {
      errors: [
        `A design can have up to ${MAX_PHOTOS} photos; this one has ${existing.length}.`,
      ],
    };
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
  let added = 0;
  try {
    added = await attachInboxPhotos(
      createSupabaseAdminClient(),
      bucket,
      designId,
      photos,
      nextPosition,
    );
  } catch (error) {
    console.error("attach phone photos failed", { designId, error });
    return { errors: ["Your photos could not be added. Try again."] };
  }
  if (added < photos.length)
    return {
      errors: [
        added
          ? `${photos.length - added} of your photos could not be read and were skipped.`
          : "Your photos could not be read. Take them again.",
      ],
    };
  revalidatePath("/");
  revalidatePath(`/holds/${designId}`);
  revalidatePath(`/holds/${designId}/edit`);
  return { added };
}
