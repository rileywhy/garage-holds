import "server-only";
import sharp from "sharp";
import { deleteObject, getObject, putObject } from "@/lib/r2";
import {
  PHOTO_SIZES,
  photoContentType,
  photoObjectKeys,
  photoSizeKey,
} from "@/features/holds/rows";

// Display sizes of a stored photo. Browsers shrink a full phone photo into a
// 300 px card with a cheap filter that turns chalk and texture into shimmer;
// a copy resampled here with sharp looks smooth. Sizes live beside the
// original under derived keys (see photoSizeKey), so nothing else needs to
// know about them: readers sign the derived key, deletes remove all of them,
// and the sweep makes any that are missing.

export async function createPhotoSizes(objectKey: string, extension: string) {
  const contentType = photoContentType(extension);
  if (!contentType) return;
  const original = await getObject(objectKey);
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
}

// The original and every size. Deleting a key that does not exist is fine,
// so this is safe for photos whose sizes were never made.
export async function deletePhotoObjects(objectKey: string) {
  for (const key of photoObjectKeys(objectKey)) await deleteObject(key);
}
