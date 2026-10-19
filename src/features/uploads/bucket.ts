import "server-only";
import { copyObject, deleteObject, headObject } from "@/lib/r2";
import { createPhotoSizes, verifyPhoto } from "./photo-sizes";
import type { UploadStore } from "./verification";

// The real bucket behind the upload checks (verification.ts) and the phone
// hand-off (phone-photos.ts).
export const bucket: UploadStore = {
  headObject,
  deleteObject,
  copyObject,
  createPhotoSizes,
  verifyPhoto,
};
