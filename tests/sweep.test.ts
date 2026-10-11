import test from "node:test";
import assert from "node:assert/strict";
import {
  ABANDONED_AFTER_MS,
  isAbandonedDraft,
  orphanedObjects,
} from "../src/features/uploads/lifecycle";

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
