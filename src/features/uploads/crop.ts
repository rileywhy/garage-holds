// Crop rectangles in image pixels, shared by the cropper dialog, the
// browser-side crop of files not yet uploaded, and the server-side crop of
// photos already stored.

export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const MIN_CROP_PIXELS = 48;

// Whole pixels inside the image, at least MIN_CROP_PIXELS on a side.
// Returns null when the rectangle is unusable, or covers the whole image so
// that cropping would change nothing.
export function normalizeCrop(
  rect: CropRect,
  imageWidth: number,
  imageHeight: number,
): CropRect | null {
  const values = [rect.left, rect.top, rect.width, rect.height];
  if (!values.every(Number.isFinite)) return null;
  const left = Math.min(Math.max(0, Math.round(rect.left)), imageWidth);
  const top = Math.min(Math.max(0, Math.round(rect.top)), imageHeight);
  const width = Math.min(Math.round(rect.width), imageWidth - left);
  const height = Math.min(Math.round(rect.height), imageHeight - top);
  if (width < MIN_CROP_PIXELS || height < MIN_CROP_PIXELS) return null;
  if (left === 0 && top === 0 && width === imageWidth && height === imageHeight)
    return null;
  return { left, top, width, height };
}

// The largest centred box of the given aspect ratio that fits the image,
// such as the 4:3 the library cards show.
export function centeredBox(
  imageWidth: number,
  imageHeight: number,
  aspect: number,
): CropRect {
  let width = imageWidth;
  let height = width / aspect;
  if (height > imageHeight) {
    height = imageHeight;
    width = height * aspect;
  }
  return {
    left: (imageWidth - width) / 2,
    top: (imageHeight - height) / 2,
    width,
    height,
  };
}
