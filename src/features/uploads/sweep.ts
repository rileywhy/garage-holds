import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deleteObject, listObjects } from "@/lib/r2";
import { OBJECT_KEY_PREFIX } from "@/features/holds/rows";
import { isAbandonedDraft, orphanedObjects } from "./lifecycle";

// Reconciles the database with the bucket. Two things can be left behind by
// an upload that never finished: a draft whose files never arrived, and an
// object whose rows are gone (a signed PUT used after its draft was
// abandoned, or a delete that failed halfway). Both are removed once they
// are old enough that no upload can still be in progress.

export interface SweepReport {
  dryRun: boolean;
  abandonedDrafts: number;
  draftObjects: number;
  orphanedObjects: number;
}

export async function sweepStorage({
  dryRun = false,
  now = new Date(),
}: { dryRun?: boolean; now?: Date } = {}): Promise<SweepReport> {
  const admin = createSupabaseAdminClient();

  const { data: drafts, error: draftsError } = await admin
    .from("designs")
    .select("id, status, created_at, design_files(object_key)")
    .eq("status", "draft");
  if (draftsError)
    throw new Error(`Could not list drafts: ${draftsError.message}`);
  const abandoned = drafts.filter((draft) => isAbandonedDraft(draft, now));
  const draftKeys = abandoned.flatMap((draft) =>
    draft.design_files.map((file) => file.object_key),
  );
  if (!dryRun && abandoned.length) {
    // Objects first: if a delete fails here, the rows survive and the next
    // sweep tries again. Deleting the design cascades to its file rows.
    for (const key of draftKeys) await deleteObject(key);
    const { error } = await admin
      .from("designs")
      .delete()
      .in(
        "id",
        abandoned.map((draft) => draft.id),
      )
      .eq("status", "draft");
    if (error) throw new Error(`Could not delete drafts: ${error.message}`);
  }

  const { data: files, error: filesError } = await admin
    .from("design_files")
    .select("object_key");
  if (filesError)
    throw new Error(`Could not list files: ${filesError.message}`);
  const known = new Set(files.map((file) => file.object_key));
  for (const key of draftKeys) known.delete(key);
  const orphans = orphanedObjects(
    await listObjects(OBJECT_KEY_PREFIX),
    known,
    now,
  );
  if (!dryRun) for (const object of orphans) await deleteObject(object.key);

  return {
    dryRun,
    abandonedDrafts: abandoned.length,
    draftObjects: draftKeys.length,
    orphanedObjects: orphans.length,
  };
}
