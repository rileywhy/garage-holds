import "server-only";
import sharp from "sharp";
import { deleteObject, getObject, putObject } from "@/lib/r2";
import {
  PHOTO_SIZES,
  photoContentType,
  photoObjectKeys,
  photoSizeKey,
} from "@/features/holds/rows";
import { stripPhotoMetadata } from "./photo-metadata";

// Display sizes of a stored photo. Browsers shrink a full phone photo into a
// 300 px card with a cheap filter that turns chalk and texture into shimmer;
// a copy resampled here with sharp looks smooth. Sizes live beside the
// original under derived keys (see photoSizeKey), so nothing else needs to
// know about them: readers sign the derived key, deletes remove all of them,
// and the sweep makes any that are missing.

// Only the extension is checked before upload, so a renamed .zip can arrive
// as x.jpg. Reading the stored bytes tells them apart: anything sharp cannot
// decode as one of the served formats is refused with this error, and the
// photo is dropped rather than marked ready (RIL-33).
export class UnreadablePhotoError extends Error {
  constructor(objectKey: string) {
    super(`${objectKey} is not a readable image`);
    this.name = "UnreadablePhotoError";
  }
}

const READABLE_FORMATS = new Set(["jpeg", "png", "webp"]);

// Throws UnreadablePhotoError unless the stored object decodes as an image.
export async function verifyPhoto(objectKey: string) {
  await readPhoto(objectKey);
}

async function readPhoto(objectKey: string) {
  const original = await getObject(objectKey);
  let format: string | undefined;
  try {
    format = (await sharp(original).metadata()).format;
  } catch {
    throw new UnreadablePhotoError(objectKey);
  }
  if (!format || !READABLE_FORMATS.has(format))
    throw new UnreadablePhotoError(objectKey);
  return original;
}

// Every photo passes through here before it is marked ready, so this is also
// where the original loses its metadata (see photo-metadata.ts). Returns the
// original's new size in bytes when it was rewritten, for the caller's row.
export async function createPhotoSizes(
  objectKey: string,
  extension: string,
): Promise<number | null> {
  const contentType = photoContentType(extension);
  if (!contentType) return null;
  let original = await readPhoto(objectKey);
  const clean = await stripPhotoMetadata(original, contentType);
  if (clean) {
    await putObject(objectKey, clean, contentType);
    original = clean;
  }
  for (const [size, width] of Object.entries(PHOTO_SIZES)) {
    // rotate() bakes the orientation tag in so every copy is upright.
    const resized = sharp(original)
      .rotate()
      .resize({ width, withoutEnlargement: true });
    const output =
      contentType === "image/png"
        ? resized.png()
        : contentType === "image/webp"
          ? resized.webp({ quality: 82 })
          : resized.jpeg({ quality: 82, mozjpeg: true });
    await putObject(
      photoSizeKey(objectKey, size as keyof typeof PHOTO_SIZES),
      new Uint8Array(await output.toBuffer()),
      contentType,
    );
  }
  return clean ? clean.byteLength : null;
}

// Cleans an original that is already stored and sized (photo-scrub.ts).
// Its sizes were made with rotate() and no metadata, so they still match.
export async function stripStoredPhoto(
  objectKey: string,
  extension: string,
  dryRun: boolean,
): Promise<number | null> {
  const contentType = photoContentType(extension);
  if (!contentType) return null;
  const clean = await stripPhotoMetadata(
    await readPhoto(objectKey),
    contentType,
  );
  if (!clean) return null;
  if (!dryRun) await putObject(objectKey, clean, contentType);
  return clean.byteLength;
}

// The original and every size. Deleting a key that does not exist is fine,
// so this is safe for photos whose sizes were never made.
export async function deletePhotoObjects(objectKey: string) {
  for (const key of photoObjectKeys(objectKey)) await deleteObject(key);
}
