import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deleteObject, listObjects } from "@/lib/r2";
import { sweep, type SweepReport } from "./lifecycle";
import { createPhotoSizes } from "./photo-sizes";
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
