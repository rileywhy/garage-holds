import { normalizeCrop, type CropRect } from "./crop";

// Crops a photo that has not been uploaded yet, in the browser, keeping its
// name and type. The rectangle is in the image's own pixels, as the cropper
// reports them. Returns the original file when the crop would change nothing.
export async function cropFile(file: File, rect: CropRect): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const crop = normalizeCrop(rect, bitmap.width, bitmap.height);
    if (!crop) return file;
    const canvas = document.createElement("canvas");
    canvas.width = crop.width;
    canvas.height = crop.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot crop photos.");
    context.drawImage(
      bitmap,
      crop.left,
      crop.top,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    );
    const type = file.type === "image/png" ? "image/png" : file.type;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, 0.92),
    );
    if (!blob) throw new Error("The cropped photo could not be saved.");
    return new File([blob], file.name, {
      type: blob.type,
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}
