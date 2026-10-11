"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import {
  deleteObject,
  headObject,
  isR2Configured,
  signImage,
  signUpload,
} from "@/lib/r2";
import { requestOrigin } from "@/lib/request-origin";
import { getUserId } from "@/features/holds/repository";
import {
  fileExtension,
  inboxObjectKey,
  photoContentType,
} from "@/features/holds/rows";
import { MAX_PHOTO_BYTES } from "@/features/holds/validation";
import {
  attachInboxPhotos,
  MAX_SESSION_PHOTOS,
  ownInboxPhotos,
} from "./phone-photos";

// The phone hand-off. The signed-in desktop starts a session and shows its
// URL as a QR code; the phone opens it and uploads photos without signing
// in, the session id being the only credential; the desktop polls for what
// arrived. Phone-side actions therefore look the session up with the
// service role and never trust anything else from the request.

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
  { photoId: string; url: string } | { error: string };

// Phone side, step 1: reserve a slot and sign one PUT URL.
export async function signPhonePhoto(
  sessionId: string,
  file: { name: string; bytes: number; type: string },
): Promise<SignPhotoResult> {
  if (!isR2Configured() || !isSupabaseAdminConfigured())
    return { error: "Uploads aren't configured in this environment yet." };
  const admin = createSupabaseAdminClient();
  const session = await openSession(admin, sessionId);
  if (!session) return { error: "This code has expired. Scan a new one." };
  const extension = fileExtension(file.name);
  if (!photoContentType(extension))
    return {
      error: `${file.name}: photos must be .jpg, .png, or .webp files.`,
    };
  if (!(file.bytes > 0 && file.bytes <= MAX_PHOTO_BYTES))
    return { error: `${file.name}: photos must be between 1 byte and 10 MB.` };
  const { count } = await admin
    .from("phone_photos")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if ((count ?? 0) >= MAX_SESSION_PHOTOS)
    return {
      error: `That's the limit of ${MAX_SESSION_PHOTOS} photos per code.`,
    };
  const photoId = crypto.randomUUID();
  const key = inboxObjectKey(sessionId, photoId, extension);
  const { error } = await admin.from("phone_photos").insert({
    id: photoId,
    session_id: sessionId,
    object_key: key,
    name: file.name,
    extension,
    bytes: file.bytes,
  });
  if (error) {
    console.error("phone photo insert failed", { sessionId, error });
    return { error: "Could not prepare the upload. Try again." };
  }
  return { photoId, url: await signUpload(key) };
}

// Phone side, step 2: confirm the object landed with the declared size.
export async function confirmPhonePhoto(
  sessionId: string,
  photoId: string,
): Promise<{ ok: true } | { error: string }> {
  if (!isR2Configured() || !isSupabaseAdminConfigured())
    return { error: "Uploads aren't configured in this environment yet." };
  const admin = createSupabaseAdminClient();
  const { data: photo } = await admin
    .from("phone_photos")
    .select("id, object_key, bytes, name")
    .eq("id", photoId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!photo) return { error: "This photo could not be found." };
  const object = await headObject(photo.object_key);
  if (!object.exists)
    return { error: `${photo.name} did not finish uploading.` };
  if (object.bytes !== photo.bytes) {
    await deleteObject(photo.object_key);
    await admin.from("phone_photos").delete().eq("id", photo.id);
    return { error: `${photo.name} arrived with an unexpected size.` };
  }
  await admin
    .from("phone_photos")
    .update({ status: "ready" })
    .eq("id", photo.id);
  return { ok: true };
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
  if (existing.length + photos.length > 6)
    return {
      errors: [
        `A design can have up to 6 photos; this one has ${existing.length}.`,
      ],
    };
  const nextPosition =
    design.design_files.reduce(
      (max, file) => Math.max(max, file.position),
      -1,
    ) + 1;
  try {
    await attachInboxPhotos(
      createSupabaseAdminClient(),
      designId,
      photos,
      nextPosition,
    );
  } catch (error) {
    console.error("attach phone photos failed", { designId, error });
    return { errors: ["Your photos could not be added. Try again."] };
  }
  revalidatePath("/");
  revalidatePath(`/holds/${designId}`);
  revalidatePath(`/holds/${designId}/edit`);
  return { added: photos.length };
}

async function openSession(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  sessionId: string,
) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  const { data } = await admin
    .from("phone_sessions")
    .select("id, owner_id, design_id, expires_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!data || Date.parse(data.expires_at) < Date.now()) return null;
  return data;
}
