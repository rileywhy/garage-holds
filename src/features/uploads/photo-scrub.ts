import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Photos published before originals were cleaned on upload (see
// photo-metadata.ts) still carry their EXIF, GPS included. The nightly sweep
// runs this after its own work, so they are cleaned on the first run after
// deploy. Later runs find nothing to do: a photo with nothing to remove is
// only read, not rewritten. That read is every photo every night, which is
// nothing at today's few photos; drop this from the route once the first
// run has passed and the pile grows (RIL-113).

export interface ScrubReport {
  dryRun: boolean;
  photos: number;
  // Photos that had metadata, and have been (or would be) rewritten.
  withMetadata: number;
  // Logged; a failure leaves that photo as it was.
  failures: number;
}

// Rewrites one stored original without its metadata and returns its new
// size, or null when it had none. With dryRun nothing is written.
export type StripStoredPhoto = (
  objectKey: string,
  extension: string,
  dryRun: boolean,
) => Promise<number | null>;

export async function scrubPhotoMetadata(
  admin: SupabaseClient<Database>,
  strip: StripStoredPhoto,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<ScrubReport> {
  const { data: files, error } = await admin
    .from("design_files")
    .select("id, object_key, extension")
    .eq("kind", "photo")
    .eq("status", "ready");
  if (error) throw new Error(`Could not list photos: ${error.message}`);
  let withMetadata = 0;
  let failures = 0;
  for (const file of files)
    try {
      const bytes = await strip(file.object_key, file.extension, dryRun);
      if (bytes === null) continue;
      withMetadata += 1;
      if (dryRun) continue;
      const { error } = await admin
        .from("design_files")
        .update({ bytes })
        .eq("id", file.id);
      if (error) throw new Error(error.message);
    } catch (error) {
      failures += 1;
      console.error("scrub: photo failed", { file, error });
    }
  return { dryRun, photos: files.length, withMetadata, failures };
}
