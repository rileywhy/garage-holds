import { isProblemGrade } from "./grades";
import { LICENSES } from "./licenses";
import {
  HOLD_SIZES,
  HOLD_TYPES,
  MOUNT_TYPES,
  SPECIAL_PROCESSES,
  type DesignInput,
  type Review,
} from "./types";

// Downloadable formats are independent of eventual browser preview support.
export const MODEL_EXTENSIONS = [
  "stl",
  "3mf",
  "step",
  "stp",
  "obj",
  "ply",
  "gltf",
  "glb",
  "iges",
  "igs",
  "f3d",
  "blend",
  "scad",
  "zip",
];
export const MAX_MODEL_BYTES = 100 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PHOTOS = 6;
type UploadFile = { name: string; size: number; type: string };
const bounded = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value >= min && value <= max;

export function validateFiles(
  models: UploadFile[],
  photos: UploadFile[],
): string[] {
  const errors: string[] = [];
  if (!models.length) errors.push("Add at least one model file.");
  if (models.length > 10) errors.push("Choose up to 10 model files.");
  errors.push(...validatePhotos(photos));
  for (const file of models) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!MODEL_EXTENSIONS.includes(extension))
      errors.push(`${file.name}: unsupported model format.`);
    if (!file.size || file.size > MAX_MODEL_BYTES)
      errors.push(
        `${file.name}: model files must be between 1 byte and 100 MB.`,
      );
  }
  if (
    [...models, ...photos].reduce((sum, file) => sum + file.size, 0) >
    MAX_TOTAL_BYTES
  )
    errors.push("Keep the total upload under 200 MB.");
  return errors;
}

// Photo rules on their own, for adding photos to a design that exists.
export function validatePhotos(photos: UploadFile[]): string[] {
  const errors: string[] = [];
  if (photos.length > MAX_PHOTOS)
    errors.push(`Choose up to ${MAX_PHOTOS} photos.`);
  for (const file of photos) {
    if (!PHOTO_TYPES.includes(file.type))
      errors.push(`${file.name}: use a JPG, PNG, or WebP photo.`);
    if (!file.size || file.size > MAX_PHOTO_BYTES)
      errors.push(`${file.name}: photos must be between 1 byte and 10 MB.`);
  }
  return errors;
}

export function validateDesign(hold: DesignInput): string[] {
  const errors: string[] = [];
  if (hold.title.trim().length < 3 || hold.title.trim().length > 80)
    errors.push("Give your design a title between 3 and 80 characters.");
  if (hold.description.trim().length < 20 || hold.description.length > 5000)
    errors.push("Add a description between 20 and 5,000 characters.");
  if (
    !HOLD_TYPES.includes(hold.type) ||
    !HOLD_SIZES.includes(hold.size) ||
    !MOUNT_TYPES.includes(hold.mount)
  )
    errors.push("Choose a valid hold type, size, and mounting method.");
  if (!isProblemGrade(hold.problemGrade))
    errors.push(
      "Choose V0–V1 or a grade from V2 to V17, or leave the grade blank.",
    );
  if (!LICENSES.includes(hold.license))
    errors.push("Choose a supported license.");
  if (
    !hold.recipes.length ||
    hold.recipes.some(
      (recipe) =>
        !recipe.material.trim() ||
        recipe.material.length > 80 ||
        (recipe.specialProcess !== null &&
          !SPECIAL_PROCESSES.includes(recipe.specialProcess)) ||
        recipe.notes.length > 2000 ||
        recipe.textureNotes.length > 2000 ||
        recipe.postProcessing.length > 200,
    )
  )
    errors.push(
      "Add a material, choose a listed special process or leave it blank, and keep print and texture notes under 2,000 characters.",
    );
  return errors;
}

// Upload forms use explicit validation so errors can stay beside the submit button.
// This includes the permission checkbox even when native browser validation is disabled.
export function validateUpload(
  hold: DesignInput,
  models: UploadFile[],
  photos: UploadFile[],
  sharingPermission: boolean,
): string[] {
  return [
    ...validateDesign(hold),
    ...validateFiles(models, photos),
    ...(!sharingPermission
      ? [
          "Confirm that you created these files or have permission to share them.",
        ]
      : []),
  ];
}

type ReviewInput = Pick<
  Review,
  | "rating"
  | "text"
  | "material"
  | "printSettings"
  | "postProcessing"
  | "problemGrade"
>;

export function validateReview(review: ReviewInput): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(review.rating) || !bounded(review.rating, 1, 5))
    errors.push("Choose a rating from 1 to 5.");
  if (review.text.trim().length < 10 || review.text.length > 2000)
    errors.push("Write a review between 10 and 2,000 characters.");
  if (!isProblemGrade(review.problemGrade))
    errors.push(
      "Choose V0–V1 or a grade from V2 to V17, or leave the grade blank.",
    );
  if (
    review.material.length > 80 ||
    review.printSettings.length > 500 ||
    review.postProcessing.length > 200
  )
    errors.push("Keep material and printing details within the field limits.");
  return errors;
}
