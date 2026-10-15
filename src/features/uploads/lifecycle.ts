import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  INBOX_KEY_PREFIX,
  OBJECT_KEY_PREFIX,
  photoObjectKeys,
} from "@/features/holds/rows";

// The storage sweep: reconciles the database with the bucket. Three things
// can be left behind by an upload that never finished: a draft whose files
// never arrived, a phone session whose photos were never attached, and an
// object whose rows are gone (a signed PUT used after its draft was
// abandoned, or a delete that failed halfway). All are removed once they are
// old enough that no upload can still be in progress. It also makes the
// display sizes of any photo that lacks them (see photo-sizes.ts).
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
  createPhotoSizes(objectKey: string, extension: string): Promise<void>;
}

export interface SweepReport {
  dryRun: boolean;
  abandonedDrafts: number;
  draftObjects: number;
  stalePhoneSessions: number;
  phoneObjects: number;
  orphanedObjects: number;
  // Photos whose display sizes were missing and have been (or would be) made.
  photoSizes: number;
  // Of those, the ones that could not be made: an object that is not a
  // readable image, or a transient failure. Logged, and tried again next
  // night; a sweep never fails because of one photo.
  photoSizeFailures: number;
}

export function isAbandonedDraft(
  design: { status: string; created_at: string },
  now: Date,
) {
  return design.status === "draft" && isStale(design.created_at, now);
}

// Phone sessions expire after minutes, but their photos stay usable by the
// desktop that started them until the design is submitted, so they are
// kept for the same day as drafts.
export function isStaleSession(session: { created_at: string }, now: Date) {
  return isStale(session.created_at, now);
}

function isStale(createdAt: string, now: Date) {
  return now.getTime() - Date.parse(createdAt) >= ABANDONED_AFTER_MS;
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
    .select("id, status, created_at, design_files(object_key, kind)")
    .eq("status", "draft");
  if (draftsError)
    throw new Error(`Could not list drafts: ${draftsError.message}`);
  const abandoned = drafts.filter((draft) => isAbandonedDraft(draft, now));
  const draftKeys = abandoned.flatMap((draft) =>
    draft.design_files.flatMap((file) =>
      file.kind === "photo"
        ? photoObjectKeys(file.object_key)
        : [file.object_key],
    ),
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

  const { data: sessions, error: sessionsError } = await admin
    .from("phone_sessions")
    .select("id, created_at, phone_photos(object_key)");
  if (sessionsError)
    throw new Error(`Could not list phone sessions: ${sessionsError.message}`);
  const stale = sessions.filter((session) => isStaleSession(session, now));
  const phoneKeys = stale.flatMap((session) =>
    session.phone_photos.map((photo) => photo.object_key),
  );
  if (!dryRun && stale.length) {
    for (const key of phoneKeys) await store.deleteObject(key);
    const { error } = await admin
      .from("phone_sessions")
      .delete()
      .in(
        "id",
        stale.map((session) => session.id),
      );
    if (error)
      throw new Error(`Could not delete phone sessions: ${error.message}`);
  }

  const [
    { data: files, error: filesError },
    { data: photos, error: photosError },
  ] = await Promise.all([
    admin.from("design_files").select("object_key, kind, extension, status"),
    admin.from("phone_photos").select("object_key"),
  ]);
  if (filesError)
    throw new Error(`Could not list files: ${filesError.message}`);
  if (photosError)
    throw new Error(`Could not list phone photos: ${photosError.message}`);
  // After a real pass the removed rows and objects are both gone; in a dry
  // run both remain, so their keys stay "known" and are not counted a second
  // time as orphans.
  const known = new Set([
    ...files.flatMap((file) =>
      file.kind === "photo"
        ? photoObjectKeys(file.object_key)
        : [file.object_key],
    ),
    ...photos.map((row) => row.object_key),
  ]);
  const stored = await store.listObjects(OBJECT_KEY_PREFIX);
  const orphans = orphanedObjects(
    [...stored, ...(await store.listObjects(INBOX_KEY_PREFIX))],
    known,
    now,
  );
  if (!dryRun)
    for (const object of orphans) await store.deleteObject(object.key);

  // Display sizes for photos that lack them: those stored before sizes
  // existed, or whose generation failed after the upload.
  const storedKeys = new Set(stored.map((object) => object.key));
  const unsized = files.filter(
    (file) =>
      file.kind === "photo" &&
      file.status === "ready" &&
      storedKeys.has(file.object_key) &&
      photoObjectKeys(file.object_key).some((key) => !storedKeys.has(key)),
  );
  let photoSizeFailures = 0;
  if (!dryRun)
    for (const file of unsized)
      try {
        await store.createPhotoSizes(file.object_key, file.extension);
      } catch (error) {
        photoSizeFailures += 1;
        console.error("sweep: photo sizes failed", { file, error });
      }

  return {
    dryRun,
    abandonedDrafts: abandoned.length,
    draftObjects: draftKeys.length,
    stalePhoneSessions: stale.length,
    phoneObjects: phoneKeys.length,
    orphanedObjects: orphans.length,
    photoSizes: unsized.length,
    photoSizeFailures,
  };
}
