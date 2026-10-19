import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { photoObjectKeys } from "@/features/holds/rows";

// Checking an upload against the bucket before anything goes public. The
// browser only says what it sent: a file becomes ready once its object is in
// the bucket at the declared size and, for a photo, decodes as an image.
// Anything else is reported and removed again, so a failed attempt leaves
// nothing behind.
//
// The clients are passed in so the integration tests can run the checks on
// the local stack with a fake bucket; bucket.ts binds the real one.

// Only the extension is checked before upload, so a renamed .zip can arrive
// as x.jpg. Reading the stored bytes tells them apart: anything that cannot
// be decoded as one of the served formats is refused with this error, and
// the photo is dropped rather than marked ready (RIL-33).
export class UnreadablePhotoError extends Error {
  constructor(objectKey: string) {
    super(`${objectKey} is not a readable image`);
    this.name = "UnreadablePhotoError";
  }
}

export interface UploadStore {
  headObject(key: string): Promise<{ exists: boolean; bytes: number }>;
  deleteObject(key: string): Promise<void>;
  copyObject(fromKey: string, toKey: string): Promise<void>;
  // Makes a photo's display sizes, reading the original on the way; throws
  // UnreadablePhotoError if it is not an image. Returns the original's new
  // size when stripping its metadata rewrote it (photo-sizes.ts).
  createPhotoSizes(
    objectKey: string,
    extension: string,
  ): Promise<number | null>;
  // Throws UnreadablePhotoError unless the object decodes as an image.
  verifyPhoto(objectKey: string): Promise<void>;
}

export interface PendingFile {
  id: string;
  object_key: string;
  name: string;
  extension: string;
  bytes: number;
  kind: "model" | "photo";
  status: "pending" | "ready";
}

// Marks each pending file ready once the bucket confirms it; files already
// ready are left alone. A file that is missing, the wrong size, or a photo
// that cannot be read loses its row first and its objects after, so an
// object whose delete fails has no row and is swept as an orphan
// (lifecycle.ts).
export async function verifyPendingFiles(
  admin: SupabaseClient<Database>,
  store: UploadStore,
  files: PendingFile[],
): Promise<{ ready: number; errors: string[] }> {
  const errors: string[] = [];
  let ready = 0;
  for (const file of files) {
    if (file.status === "ready") continue;
    const drop = async (error: string, objectKeys: string[]) => {
      errors.push(error);
      await admin.from("design_files").delete().eq("id", file.id);
      for (const key of objectKeys) await store.deleteObject(key);
    };
    const object = await store.headObject(file.object_key);
    if (!object.exists) {
      await drop(`${file.name} did not finish uploading.`, []);
      continue;
    }
    if (object.bytes !== file.bytes) {
      await drop(`${file.name} arrived with an unexpected size.`, [
        file.object_key,
      ]);
      continue;
    }
    // A photo's sizes come first: making them reads the bytes, so a file
    // that is not an image is refused here instead of becoming a ready row
    // with a broken card and a sweep that fails on it every night.
    // Stripping its metadata can change its size.
    let bytes = file.bytes;
    if (file.kind === "photo")
      try {
        bytes =
          (await store.createPhotoSizes(file.object_key, file.extension)) ??
          bytes;
      } catch (error) {
        const unreadable = error instanceof UnreadablePhotoError;
        if (!unreadable) console.error("photo sizes failed", { file, error });
        await drop(
          unreadable
            ? `${file.name} is not a readable image.`
            : `${file.name} could not be prepared. Try again.`,
          photoObjectKeys(file.object_key),
        );
        continue;
      }
    const { error } = await admin
      .from("design_files")
      .update({ status: "ready", bytes })
      .eq("id", file.id);
    if (error) {
      console.error("file ready update failed", { file, error });
      errors.push(`${file.name} could not be saved. Try again.`);
      continue;
    }
    ready += 1;
  }
  return { ready, errors };
}
