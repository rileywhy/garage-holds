import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { OBJECT_KEY_PREFIX } from "@/features/holds/rows";

// The storage sweep: reconciles the database with the bucket. Two things can
// be left behind by an upload that never finished: a draft whose files never
// arrived, and an object whose rows are gone (a signed PUT used after its
// draft was abandoned, or a delete that failed halfway). Both are removed
// once they are old enough that no upload can still be in progress.
//
// The clients are passed in so the integration tests can run the sweep on
// the local stack with a fake bucket; sweep.ts binds the real ones.

// Nothing in the app keeps a draft on purpose: every upload publishes in the
// same sitting, and signed upload URLs expire after 30 minutes. Revisit this
// if "save as draft" ever exists.
export const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

export interface StoredObject {
  key: string;
  lastModified: Date;
}

export interface ObjectStore {
  listObjects(prefix: string): Promise<StoredObject[]>;
  deleteObject(key: string): Promise<void>;
}

export interface SweepReport {
  dryRun: boolean;
  abandonedDrafts: number;
  draftObjects: number;
  orphanedObjects: number;
}

export function isAbandonedDraft(
  design: { status: string; created_at: string },
  now: Date,
) {
  return (
    design.status === "draft" &&
    now.getTime() - Date.parse(design.created_at) >= ABANDONED_AFTER_MS
  );
}

// An object no row refers to, old enough that no signed upload can still
// be writing it.
export function orphanedObjects(
  objects: StoredObject[],
  knownKeys: ReadonlySet<string>,
  now: Date,
) {
  return objects.filter(
    (object) =>
      !knownKeys.has(object.key) &&
      now.getTime() - object.lastModified.getTime() >= ABANDONED_AFTER_MS,
  );
}

export async function sweep(
  admin: SupabaseClient<Database>,
  store: ObjectStore,
  { dryRun = false, now = new Date() }: { dryRun?: boolean; now?: Date } = {},
): Promise<SweepReport> {
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
    for (const key of draftKeys) await store.deleteObject(key);
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
  // After a real pass the abandoned drafts' rows and objects are both gone;
  // in a dry run both remain, so their keys stay "known" and are not counted
  // a second time as orphans.
  const known = new Set(files.map((file) => file.object_key));
  const orphans = orphanedObjects(
    await store.listObjects(OBJECT_KEY_PREFIX),
    known,
    now,
  );
  if (!dryRun)
    for (const object of orphans) await store.deleteObject(object.key);

  return {
    dryRun,
    abandonedDrafts: abandoned.length,
    draftObjects: draftKeys.length,
    orphanedObjects: orphans.length,
  };
}
