import type { Tables } from "@/lib/supabase/database.types";
import type { Hold, ModelFile, Photo, Review, SpecialProcess } from "./types";
import type { License } from "./licenses";

// Plain conversions between database rows and domain objects. No I/O here,
// so the shapes stay testable without a database.

// Columns come from the generated database types. Text columns that the
// schema restricts with check constraints are narrowed to the domain unions
// here, since the generator only sees `text`.
export type DesignRow = Omit<
  Tables<"designs">,
  "hold_type" | "size" | "mounting" | "license" | "special_process" | "status"
> & {
  hold_type: Hold["type"];
  size: Hold["size"];
  mounting: Hold["mount"];
  license: License;
  special_process: SpecialProcess | null;
  status: Hold["status"];
  profiles: { display_name: string } | null;
  design_files: DesignFileRow[];
};

export type DesignFileRow = Omit<Tables<"design_files">, "kind" | "status"> & {
  kind: "model" | "photo";
  status: "pending" | "ready";
};

export type ReviewRow = Tables<"reviews"> & {
  profiles: { display_name: string } | null;
};

// Signed URLs are produced by the caller, keyed by file id (and "<id>:card",
// "<id>:large" for a photo's display sizes), so this stays pure.
export function designRowToHold(
  row: DesignRow,
  urls: ReadonlyMap<string, string>,
): Hold {
  const ready = [...row.design_files]
    .filter((file) => file.status === "ready")
    .sort((a, b) => a.position - b.position);
  const photos: Photo[] = ready
    .filter((file) => file.kind === "photo")
    .map((file) => {
      const url = urls.get(file.id) ?? "";
      return {
        id: file.id,
        url,
        cardUrl: urls.get(`${file.id}:card`) ?? url,
        largeUrl: urls.get(`${file.id}:large`) ?? url,
      };
    });
  const files: ModelFile[] = ready
    .filter((file) => file.kind === "model")
    .map((file) => ({
      id: file.id,
      name: file.name,
      bytes: file.bytes,
      extension: file.extension,
      url: urls.get(file.id) ?? "",
    }));
  return {
    id: row.id,
    ownerId: row.owner_id,
    creator: row.profiles?.display_name ?? "Unknown maker",
    status: row.status,
    title: row.title,
    description: row.description,
    type: row.hold_type,
    size: row.size,
    mount: row.mounting,
    problemGrade: row.problem_grade,
    recipes: [
      {
        material: row.material,
        specialProcess: row.special_process,
        notes: row.print_notes,
        textureNotes: row.texture_notes,
        postProcessing: row.post_processing,
      },
    ],
    tags: row.tags,
    license: row.license,
    color: "#a2b5a6",
    illustration: "ripple",
    photos,
    files,
    createdAt: row.created_at,
    isSample: false,
  };
}

export function reviewRowToReview(row: ReviewRow): Review {
  return {
    id: row.id,
    holdId: row.design_id,
    authorId: row.author_id,
    author: row.profiles?.display_name ?? "Unknown maker",
    rating: row.rating,
    text: row.body,
    material: row.material,
    printSettings: row.print_settings,
    postProcessing: row.post_processing,
    problemGrade: row.problem_grade,
    createdAt: row.created_at,
  };
}

// Object keys group a design's files and never embed user-supplied names.
// Photos handed over from a phone wait under inbox/<session>/ until the
// design they belong to exists; attaching copies them under designs/.
export const OBJECT_KEY_PREFIX = "designs/";
export const INBOX_KEY_PREFIX = "inbox/";

export function objectKey(designId: string, fileId: string, extension: string) {
  return `${OBJECT_KEY_PREFIX}${designId}/${fileId}.${extension}`;
}

export function inboxObjectKey(
  sessionId: string,
  photoId: string,
  extension: string,
) {
  return `${INBOX_KEY_PREFIX}${sessionId}/${photoId}.${extension}`;
}

export function fileExtension(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return /^[a-z0-9]{1,8}$/.test(extension) ? extension : "";
}

const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function photoContentType(extension: string) {
  return IMAGE_TYPES[extension] ?? null;
}

// Display sizes of a photo, by longest width in pixels: cards at up to 2x
// pixel density, and the design page's main view.
export const PHOTO_SIZES = { card: 800, large: 1600 } as const;
export type PhotoSize = keyof typeof PHOTO_SIZES;

// designs/<design>/<file>.jpg -> designs/<design>/<file>-card.jpg
export function photoSizeKey(objectKey: string, size: PhotoSize) {
  const dot = objectKey.lastIndexOf(".");
  return dot > objectKey.lastIndexOf("/")
    ? `${objectKey.slice(0, dot)}-${size}${objectKey.slice(dot)}`
    : `${objectKey}-${size}`;
}

// The original followed by every size.
export function photoObjectKeys(objectKey: string) {
  return [
    objectKey,
    ...(Object.keys(PHOTO_SIZES) as PhotoSize[]).map((size) =>
      photoSizeKey(objectKey, size),
    ),
  ];
}
