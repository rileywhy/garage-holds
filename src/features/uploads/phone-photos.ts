import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  fileExtension,
  inboxObjectKey,
  objectKey,
  photoContentType,
  photoObjectKeys,
} from "@/features/holds/rows";
import { MAX_PHOTO_BYTES } from "@/features/holds/validation";
import { UnreadablePhotoError, type UploadStore } from "./verification";

// Photos handed over from a phone (see phone-actions.ts). A session is a
// short-lived, unguessable id the phone uploads into; the photos stay in the
// inbox until a design claims them. The phone never signs in, so its steps
// look the session up with the service role and trust nothing else from the
// request.
//
// The clients are passed in so the integration tests can run these on the
// local stack with a fake bucket; the actions bind the real ones.

export const SESSION_MINUTES = 15;
export const MAX_SESSION_PHOTOS = 12;

type Admin = SupabaseClient<Database>;

export interface InboxPhoto {
  id: string;
  session_id: string;
  object_key: string;
  name: string;
  extension: string;
  bytes: number;
}

const EXPIRED = "This code has expired. Scan a new one.";

// The session a phone request names, or null when the id is malformed,
// unknown or expired.
export async function openSession(admin: Admin, sessionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  const { data } = await admin
    .from("phone_sessions")
    .select("id, owner_id, design_id, expires_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!data || Date.parse(data.expires_at) < Date.now()) return null;
  return data;
}

export type ReservePhotoResult =
  | { photoId: string; objectKey: string; contentType: string }
  | { error: string };

// Phone side, step 1: a pending row for one photo, once the session, the
// file and the per-session cap allow it. The caller signs the PUT URL.
export async function reservePhonePhoto(
  admin: Admin,
  sessionId: string,
  file: { name: string; bytes: number },
): Promise<ReservePhotoResult> {
  if (!(await openSession(admin, sessionId))) return { error: EXPIRED };
  const extension = fileExtension(file.name);
  const contentType = photoContentType(extension);
  if (!contentType)
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
  return { photoId, objectKey: key, contentType };
}

// Phone side, step 2: the photo is ready once its object is in the bucket
// at the declared size and decodes as an image. Every phone step checks the
// session, as the phone page promises: the PUT URL is the real window, but
// an expired code confirms nothing. A photo that did not arrive keeps its
// row for the sweep; one that arrived wrong loses its row, then its object.
export async function verifyPhonePhoto(
  admin: Admin,
  store: UploadStore,
  sessionId: string,
  photoId: string,
): Promise<{ ok: true } | { error: string }> {
  if (!(await openSession(admin, sessionId))) return { error: EXPIRED };
  const { data: photo } = await admin
    .from("phone_photos")
    .select("id, object_key, bytes, name")
    .eq("id", photoId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!photo) return { error: "This photo could not be found." };
  const object = await store.headObject(photo.object_key);
  if (!object.exists)
    return { error: `${photo.name} did not finish uploading.` };
  const drop = async (error: string) => {
    await admin.from("phone_photos").delete().eq("id", photo.id);
    await store.deleteObject(photo.object_key);
    return { error };
  };
  if (object.bytes !== photo.bytes)
    return drop(`${photo.name} arrived with an unexpected size.`);
  try {
    await store.verifyPhoto(photo.object_key);
  } catch (error) {
    if (error instanceof UnreadablePhotoError)
      return drop(`${photo.name} is not a readable image.`);
    console.error("phone photo check failed", { photoId, error });
    return drop(`${photo.name} could not be checked. Try again.`);
  }
  await admin
    .from("phone_photos")
    .update({ status: "ready" })
    .eq("id", photo.id);
  return { ok: true };
}

// The user's own verified inbox photos among the requested ids, in the
// order they arrived. Reads as the user, so row-level security limits the
// result to sessions they started.
export async function ownInboxPhotos(
  supabase: SupabaseClient<Database>,
  photoIds: string[],
): Promise<InboxPhoto[]> {
  if (!photoIds.length) return [];
  const { data, error } = await supabase
    .from("phone_photos")
    .select("id, session_id, object_key, name, extension, bytes")
    .in("id", photoIds)
    .eq("status", "ready")
    .order("created_at");
  if (error) throw new Error(`Could not load phone photos: ${error.message}`);
  return data;
}

// Shaped like a browser File for the shared upload validation.
export function asUploadFile(photo: InboxPhoto) {
  return {
    name: photo.name,
    size: photo.bytes,
    type: photoContentType(photo.extension) ?? "",
  };
}

// Moves verified inbox photos under the design and records them as ready
// files. The caller has already checked that the design belongs to the user
// and that the photos are theirs. Copies happen first so a failure leaves
// the inbox intact for a retry; leftover inbox objects are swept later.
export async function attachInboxPhotos(
  admin: Admin,
  store: UploadStore,
  designId: string,
  photos: InboxPhoto[],
  firstPosition: number,
): Promise<number> {
  const deletePhotoObjects = async (key: string) => {
    for (const each of photoObjectKeys(key)) await store.deleteObject(each);
  };
  let attached = 0;
  for (const [index, photo] of photos.entries()) {
    const fileId = crypto.randomUUID();
    const key = objectKey(designId, fileId, photo.extension);
    await store.copyObject(photo.object_key, key);
    // The phone checked the bytes when it confirmed the photo, so the
    // sizes are expected to succeed; if they do not, the photo is dropped
    // with a log line rather than left as a ready row with a broken card.
    // Stripping its metadata can change its size.
    let bytes = photo.bytes;
    try {
      bytes = (await store.createPhotoSizes(key, photo.extension)) ?? bytes;
    } catch (error) {
      console.error("phone photo sizes failed", { designId, photo, error });
      await deletePhotoObjects(key);
      await admin.from("phone_photos").delete().eq("id", photo.id);
      await store.deleteObject(photo.object_key);
      continue;
    }
    const { error } = await admin.from("design_files").insert({
      id: fileId,
      design_id: designId,
      kind: "photo",
      object_key: key,
      name: photo.name,
      extension: photo.extension,
      bytes,
      position: firstPosition + index,
      status: "ready",
    });
    if (error) {
      await deletePhotoObjects(key);
      throw new Error(`Could not attach ${photo.name}: ${error.message}`);
    }
    attached += 1;
    await admin.from("phone_photos").delete().eq("id", photo.id);
    await store.deleteObject(photo.object_key);
  }
  return attached;
}
