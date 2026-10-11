import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { copyObject, deleteObject } from "@/lib/r2";
import { objectKey, photoContentType } from "@/features/holds/rows";

// Photos handed over from a phone (see phone-actions.ts). A session is a
// short-lived, unguessable id the phone uploads into; the photos stay in the
// inbox until a design claims them.

export const SESSION_MINUTES = 15;
export const MAX_SESSION_PHOTOS = 12;

export interface InboxPhoto {
  id: string;
  session_id: string;
  object_key: string;
  name: string;
  extension: string;
  bytes: number;
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
  admin: SupabaseClient<Database>,
  designId: string,
  photos: InboxPhoto[],
  firstPosition: number,
) {
  for (const [index, photo] of photos.entries()) {
    const fileId = crypto.randomUUID();
    const key = objectKey(designId, fileId, photo.extension);
    await copyObject(photo.object_key, key);
    const { error } = await admin.from("design_files").insert({
      id: fileId,
      design_id: designId,
      kind: "photo",
      object_key: key,
      name: photo.name,
      extension: photo.extension,
      bytes: photo.bytes,
      position: firstPosition + index,
      status: "ready",
    });
    if (error) {
      await deleteObject(key);
      throw new Error(`Could not attach ${photo.name}: ${error.message}`);
    }
    await admin.from("phone_photos").delete().eq("id", photo.id);
    await deleteObject(photo.object_key);
  }
}
