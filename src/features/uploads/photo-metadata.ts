import sharp from "sharp";

// Phone photos carry EXIF: camera, time and often the GPS position of where
// they were taken, which for a home wall is someone's address. Originals are
// served to every visitor of a published design, so they are re-encoded
// without it before they are marked ready. The colour profile stays (phone
// photos are often Display P3 and would shift without it) and the
// orientation tag is baked in so the photo stays upright.
//
// Re-encoding costs one lossy pass, so a photo with nothing to remove is left
// alone: re-running this on a clean photo changes nothing.

// The clean bytes, or null when the photo has no metadata to remove. Throws
// when the bytes are not a readable image.
export async function stripPhotoMetadata(
  original: Uint8Array,
  contentType: string,
): Promise<Uint8Array | null> {
  const meta = await sharp(original).metadata();
  const hasMetadata =
    meta.exif ||
    meta.xmp ||
    meta.iptc ||
    meta.comments?.length ||
    (meta.orientation ?? 1) !== 1;
  if (!hasMetadata) return null;
  const image = sharp(original).rotate().keepIccProfile();
  const output =
    contentType === "image/png"
      ? image.png()
      : contentType === "image/webp"
        ? image.webp({ quality: 90 })
        : image.jpeg({ quality: 92, mozjpeg: true });
  return new Uint8Array(await output.toBuffer());
}
