import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import {
  ABANDONED_AFTER_MS,
  sweep,
  type ObjectStore,
  type StoredObject,
} from "../../src/features/uploads/lifecycle";
import { adminClient, createUser, deleteUser, type TestUser } from "./stack";

// The sweep against the real schema on the local stack, with the bucket
// replaced by an in-memory store so nothing outside the test is touched.

const admin = adminClient();
let user: TestUser;
let oldDraft: string;
let freshDraft: string;
let published: string;

const now = new Date();
const twoDaysAgo = new Date(now.getTime() - 2 * ABANDONED_AFTER_MS);
const minutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

function fakeStore(initial: StoredObject[]) {
  const objects = new Map(initial.map((object) => [object.key, object]));
  const store: ObjectStore & { keys: () => string[] } = {
    listObjects: async (prefix) =>
      [...objects.values()].filter((object) => object.key.startsWith(prefix)),
    deleteObject: async (key) => {
      objects.delete(key);
    },
    keys: () => [...objects.keys()].sort(),
  };
  return store;
}

async function insertDesign(title: string, createdAt: Date) {
  const { data, error } = await admin
    .from("designs")
    .insert({
      owner_id: user.id,
      title,
      description: "A crisp incut edge for steep boards, tested on a 40.",
      hold_type: "Crimp",
      size: "Medium",
      mounting: "Screw-on",
      license: "CC BY 4.0",
      material: "PETG",
      created_at: createdAt.toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function insertFile(designId: string, key: string, status: string) {
  const { error } = await admin.from("design_files").insert({
    design_id: designId,
    kind: "model",
    object_key: key,
    name: "model.stl",
    extension: "stl",
    bytes: 10,
    status,
  });
  if (error) throw error;
}

before(async () => {
  user = await createUser(admin, "sweeper");
  oldDraft = await insertDesign("Old draft", twoDaysAgo);
  await insertFile(oldDraft, `designs/${oldDraft}/model.stl`, "pending");
  freshDraft = await insertDesign("Fresh draft", minutesAgo);
  await insertFile(freshDraft, `designs/${freshDraft}/model.stl`, "pending");
  published = await insertDesign("Published", twoDaysAgo);
  await insertFile(published, `designs/${published}/model.stl`, "ready");
  const { error } = await admin
    .from("designs")
    .update({ status: "published" })
    .eq("id", published);
  if (error) throw error;
});

after(async () => {
  if (user) await deleteUser(admin, user);
});

test("the sweep removes stale drafts and orphaned objects, nothing else", async () => {
  const store = fakeStore([
    { key: `designs/${oldDraft}/model.stl`, lastModified: twoDaysAgo },
    { key: `designs/${freshDraft}/model.stl`, lastModified: minutesAgo },
    { key: `designs/${published}/model.stl`, lastModified: twoDaysAgo },
    { key: "designs/gone/orphan.stl", lastModified: twoDaysAgo },
    { key: "designs/gone/arriving.stl", lastModified: minutesAgo },
    { key: "unrelated/other.txt", lastModified: twoDaysAgo },
  ]);
  const initial = store.keys();

  const rehearsal = await sweep(admin, store, { dryRun: true, now });
  assert.deepEqual(rehearsal, {
    dryRun: true,
    abandonedDrafts: 1,
    draftObjects: 1,
    orphanedObjects: 1,
  });
  assert.deepEqual(store.keys(), initial);

  const report = await sweep(admin, store, { now });
  assert.deepEqual(report, { ...rehearsal, dryRun: false });
  assert.deepEqual(
    store.keys(),
    [
      `designs/${freshDraft}/model.stl`,
      `designs/${published}/model.stl`,
      "designs/gone/arriving.stl",
      "unrelated/other.txt",
    ].sort(),
  );

  const { data: remaining } = await admin
    .from("designs")
    .select("id, status")
    .eq("owner_id", user.id)
    .order("title");
  assert.deepEqual(remaining, [
    { id: freshDraft, status: "draft" },
    { id: published, status: "published" },
  ]);

  const again = await sweep(admin, store, { now });
  assert.deepEqual(again, {
    dryRun: false,
    abandonedDrafts: 0,
    draftObjects: 0,
    orphanedObjects: 0,
  });
});
