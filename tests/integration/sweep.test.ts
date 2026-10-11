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
let oldSession: string;
let freshSession: string;

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
    createPhotoSizes: async (key) => {
      for (const size of ["card", "large"])
        objects.set(key.replace(/\.jpg$/, `-${size}.jpg`), {
          key: key.replace(/\.jpg$/, `-${size}.jpg`),
          lastModified: now,
        });
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

async function insertFile(
  designId: string,
  key: string,
  status: string,
  kind: "model" | "photo" = "model",
) {
  const { error } = await admin.from("design_files").insert({
    design_id: designId,
    kind,
    object_key: key,
    name: kind === "photo" ? "wall.jpg" : "model.stl",
    extension: kind === "photo" ? "jpg" : "stl",
    bytes: 10,
    status,
  });
  if (error) throw error;
}

async function insertSession(createdAt: Date) {
  const { data, error } = await admin
    .from("phone_sessions")
    .insert({ owner_id: user.id, created_at: createdAt.toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  const { error: photoError } = await admin.from("phone_photos").insert({
    session_id: data.id,
    object_key: `inbox/${data.id}/photo.jpg`,
    name: "wall.jpg",
    extension: "jpg",
    bytes: 10,
    status: "ready",
  });
  if (photoError) throw photoError;
  return data.id;
}

before(async () => {
  user = await createUser(admin, "sweeper");
  oldDraft = await insertDesign("Old draft", twoDaysAgo);
  await insertFile(oldDraft, `designs/${oldDraft}/model.stl`, "pending");
  freshDraft = await insertDesign("Fresh draft", minutesAgo);
  await insertFile(freshDraft, `designs/${freshDraft}/model.stl`, "pending");
  published = await insertDesign("Published", twoDaysAgo);
  await insertFile(published, `designs/${published}/model.stl`, "ready");
  await insertFile(
    published,
    `designs/${published}/sized.jpg`,
    "ready",
    "photo",
  );
  await insertFile(
    published,
    `designs/${published}/plain.jpg`,
    "ready",
    "photo",
  );
  const { error } = await admin
    .from("designs")
    .update({ status: "published" })
    .eq("id", published);
  if (error) throw error;
  oldSession = await insertSession(twoDaysAgo);
  freshSession = await insertSession(minutesAgo);
});

after(async () => {
  if (user) await deleteUser(admin, user);
});

test("the sweep removes stale drafts and orphaned objects, nothing else", async () => {
  const store = fakeStore([
    { key: `designs/${oldDraft}/model.stl`, lastModified: twoDaysAgo },
    { key: `designs/${freshDraft}/model.stl`, lastModified: minutesAgo },
    { key: `designs/${published}/model.stl`, lastModified: twoDaysAgo },
    { key: `designs/${published}/sized.jpg`, lastModified: twoDaysAgo },
    { key: `designs/${published}/sized-card.jpg`, lastModified: twoDaysAgo },
    { key: `designs/${published}/sized-large.jpg`, lastModified: twoDaysAgo },
    { key: `designs/${published}/plain.jpg`, lastModified: twoDaysAgo },
    { key: `inbox/${oldSession}/photo.jpg`, lastModified: twoDaysAgo },
    { key: `inbox/${freshSession}/photo.jpg`, lastModified: minutesAgo },
    { key: "designs/gone/orphan.stl", lastModified: twoDaysAgo },
    { key: "designs/gone/arriving.stl", lastModified: minutesAgo },
    { key: "inbox/gone/orphan.jpg", lastModified: twoDaysAgo },
    { key: "unrelated/other.txt", lastModified: twoDaysAgo },
  ]);
  const initial = store.keys();

  const rehearsal = await sweep(admin, store, { dryRun: true, now });
  assert.deepEqual(rehearsal, {
    dryRun: true,
    abandonedDrafts: 1,
    draftObjects: 1,
    stalePhoneSessions: 1,
    phoneObjects: 1,
    orphanedObjects: 2,
    photoSizes: 1,
  });
  assert.deepEqual(store.keys(), initial);

  const report = await sweep(admin, store, { now });
  assert.deepEqual(report, { ...rehearsal, dryRun: false });
  assert.deepEqual(
    store.keys(),
    [
      `designs/${freshDraft}/model.stl`,
      `designs/${published}/model.stl`,
      `designs/${published}/sized.jpg`,
      `designs/${published}/sized-card.jpg`,
      `designs/${published}/sized-large.jpg`,
      `designs/${published}/plain.jpg`,
      `designs/${published}/plain-card.jpg`,
      `designs/${published}/plain-large.jpg`,
      `inbox/${freshSession}/photo.jpg`,
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
  const { data: sessions } = await admin
    .from("phone_sessions")
    .select("id")
    .eq("owner_id", user.id);
  assert.deepEqual(sessions, [{ id: freshSession }]);

  const again = await sweep(admin, store, { now });
  assert.deepEqual(again, {
    dryRun: false,
    abandonedDrafts: 0,
    draftObjects: 0,
    stalePhoneSessions: 0,
    phoneObjects: 0,
    orphanedObjects: 0,
    photoSizes: 0,
  });
});
