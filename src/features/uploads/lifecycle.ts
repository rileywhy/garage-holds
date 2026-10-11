// Pure decisions for the storage sweep in sweep.ts. No I/O, so they are
// testable without a database or a bucket.

// Nothing in the app keeps a draft on purpose: every upload publishes in the
// same sitting, and signed upload URLs expire after 30 minutes. Revisit this
// if "save as draft" ever exists.
export const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

export interface StoredObject {
  key: string;
  lastModified: Date;
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
