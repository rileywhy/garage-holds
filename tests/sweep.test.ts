import test from "node:test";
import assert from "node:assert/strict";
import {
  ABANDONED_AFTER_MS,
  isAbandonedDraft,
  orphanedObjects,
  sweep,
} from "../src/features/uploads/lifecycle";
import { OBJECT_KEY_PREFIX } from "../src/features/holds/rows";

const now = new Date("2026-10-12T12:00:00.000Z");
const old = new Date(now.getTime() - ABANDONED_AFTER_MS - 1000);
const recent = new Date(now.getTime() - 10 * 60 * 1000);

test("only old drafts count as abandoned", () => {
  assert.equal(
    isAbandonedDraft({ status: "draft", created_at: old.toISOString() }, now),
    true,
  );
  assert.equal(
    isAbandonedDraft(
      { status: "draft", created_at: recent.toISOString() },
      now,
    ),
    false,
  );
  assert.equal(
    isAbandonedDraft(
      { status: "published", created_at: old.toISOString() },
      now,
    ),
    false,
  );
});

test("objects are orphaned when no row knows them and no upload can be in flight", () => {
  const known = new Set(["designs/d/kept.stl"]);
  const orphans = orphanedObjects(
    [
      { key: "designs/d/kept.stl", lastModified: old },
      { key: "designs/d/stale.stl", lastModified: old },
      { key: "designs/d/arriving.stl", lastModified: recent },
    ],
    known,
    now,
  );
  assert.deepEqual(
    orphans.map((object) => object.key),
    ["designs/d/stale.stl"],
  );
});

// A stand-in for the admin client: every table read answers with the rows
// given here, and every write succeeds. Enough to run the sweep's photo-size
// pass without a database.
function fakeAdmin(tables: Record<string, unknown[]>) {
  const chain = (table: string) => {
    const result = { data: tables[table] ?? [], error: null };
    const query: Record<string, unknown> = {
      then: (resolve: (value: typeof result) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    for (const method of ["select", "eq", "in", "delete"])
      query[method] = () => query;
    return query;
  };
  return { from: chain } as unknown as Parameters<typeof sweep>[0];
}

test("a photo whose sizes cannot be made is counted and logged, not fatal", async () => {
  const admin = fakeAdmin({
    designs: [],
    phone_sessions: [],
    design_files: [
      {
        object_key: "designs/d/bad.jpg",
        kind: "photo",
        extension: "jpg",
        status: "ready",
      },
      {
        object_key: "designs/d/good.jpg",
        kind: "photo",
        extension: "jpg",
        status: "ready",
      },
    ],
    phone_photos: [],
  });
  const made: string[] = [];
  const store = {
    listObjects: async (prefix: string) =>
      prefix === OBJECT_KEY_PREFIX
        ? [
            { key: "designs/d/bad.jpg", lastModified: old },
            { key: "designs/d/good.jpg", lastModified: old },
          ]
        : [],
    deleteObject: async () => {},
    createPhotoSizes: async (key: string) => {
      if (key.endsWith("bad.jpg")) throw new Error("not an image");
      made.push(key);
    },
  };
  const quiet = console.error;
  console.error = () => {};
  try {
    const report = await sweep(admin, store, { now });
    assert.equal(report.photoSizes, 2);
    assert.equal(report.photoSizeFailures, 1);
    assert.deepEqual(made, ["designs/d/good.jpg"]);
  } finally {
    console.error = quiet;
  }
});
