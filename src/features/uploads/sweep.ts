import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deleteObject, listObjects } from "@/lib/r2";
import { sweep, type SweepReport } from "./lifecycle";
import { createPhotoSizes, stripStoredPhoto } from "./photo-sizes";
import { scrubPhotoMetadata, type ScrubReport } from "./photo-scrub";
import { makeModelPreview } from "./model-previews";

// The sweep against the real database and bucket. See lifecycle.ts for what
// it removes and why.
export function sweepStorage(options: {
  dryRun?: boolean;
}): Promise<SweepReport> {
  return sweep(
    createSupabaseAdminClient(),
    {
      listObjects,
      deleteObject,
      createPhotoSizes,
      createModelPreview: makeModelPreview,
    },
    options,
  );
}

// The photo metadata scrub against the real database and bucket. See
// photo-scrub.ts.
export function scrubStoredPhotos(options: {
  dryRun?: boolean;
}): Promise<ScrubReport> {
  return scrubPhotoMetadata(
    createSupabaseAdminClient(),
    stripStoredPhoto,
    options,
  );
}
