import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  fileExtension,
  inboxObjectKey,
  objectKey,
  photoObjectKeys,
} from "../../src/features/holds/rows";
import {
  UnreadablePhotoError,
  verifyPendingFiles,
  type PendingFile,
  type UploadStore,
} from "../../src/features/uploads/verification";
import {
  attachInboxPhotos,
  MAX_SESSION_PHOTOS,
  openSession,
  reservePhonePhoto,
  verifyPhonePhoto,
} from "../../src/features/uploads/phone-photos";
import { adminClient, createUser, deleteUser, type TestUser } from "./stack";

// Checking uploads against the bucket before they go public: publishing a
// draft, adding photos, replacing a model, and the phone hand-off. The rows
// are real, on the local stack; the bucket is an in-memory stand-in so
// nothing outside the test is touched.

const admin = adminClient();
let user: TestUser;

before(async () => {
  user = await createUser(admin, "uploader");
});

after(async () => {
  if (user) await deleteUser(admin, user);
});

// What the stand-in bucket holds under a key. "junk" is anything that does
// not decode as an image (a renamed .zip); "flaky" makes one display size
// and then fails, like a timeout halfway through. strippedTo is the size of
// a photo once its metadata is removed.
interface Stored {
  bytes: number;
  kind: "image" | "junk" | "flaky";
  strippedTo?: number;
}

function fakeBucket(initial: Record<string, Stored>) {
  const objects = new Map(Object.entries(initial));
  const read = (key: string) => {
    const object = objects.get(key);
    if (object?.kind === "flaky") throw new Error("timed out");
    if (object?.kind !== "image") throw new UnreadablePhotoError(key);
    return object;
  };
  const bucket: UploadStore & { keys: () => string[] } = {
    headObject: async (key) => {
      const object = objects.get(key);
      return { exists: Boolean(object), bytes: object?.bytes ?? 0 };
    },
    deleteObject: async (key) => {
      objects.delete(key);
    },
    copyObject: async (fromKey, toKey) => {
      const object = objects.get(fromKey);
      if (!object) throw new Error(`${fromKey} is not in the bucket`);
      objects.set(toKey, { ...object });
    },
    createPhotoSizes: async (key) => {
      const [, ...sizes] = photoObjectKeys(key);
      if (objects.get(key)?.kind === "flaky")
        objects.set(sizes[0], { bytes: 1, kind: "image" });
      const object = read(key);
      for (const size of sizes) objects.set(size, { bytes: 1, kind: "image" });
      if (object.strippedTo === undefined) return null;
      object.bytes = object.strippedTo;
      return object.bytes;
    },
    verifyPhoto: async (key) => {
      read(key);
    },
    keys: () => [...objects.keys()].sort(),
  };
  return bucket;
}

// Runs work with console.error captured, for the failures that are logged.
async function capturingErrors<T>(work: () => Promise<T>) {
  const logged: string[] = [];
  const original = console.error;
  console.error = (message: string) => logged.push(message);
  try {
    return { result: await work(), logged };
  } finally {
    console.error = original;
  }
}

async function insertDraft() {
  const { data, error } = await admin
    .from("designs")
    .insert({
      owner_id: user.id,
      title: "Mesa edge",
      description: "A crisp incut edge for steep boards, tested on a 40.",
      hold_type: "Crimp",
      size: "Medium",
      mounting: "Screw-on",
      license: "CC BY 4.0",
      design_method: "human-shaped",
      material: "PETG",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function insertFile(
  designId: string,
  name: string,
  bytes: number,
  status: "pending" | "ready" = "pending",
): Promise<PendingFile> {
  const id = randomUUID();
  const extension = fileExtension(name);
  const row = {
    id,
    design_id: designId,
    kind: extension === "stl" ? ("model" as const) : ("photo" as const),
    object_key: objectKey(designId, id, extension),
    name,
    extension,
    bytes,
    status,
  };
  const { error } = await admin.from("design_files").insert(row);
  if (error) throw error;
  return row;
}

async function filesOf(designId: string) {
  const { data, error } = await admin
    .from("design_files")
    .select("name, bytes, status")
    .eq("design_id", designId)
    .order("name");
  if (error) throw error;
  return data;
}

describe("design files", () => {
  test("files that arrived intact become ready, a stripped photo at its new size", async () => {
    const designId = await insertDraft();
    const model = await insertFile(designId, "edge.stl", 5000);
    const photo = await insertFile(designId, "wall.jpg", 3000);
    // Already verified on an earlier try, and not looked at again.
    const earlier = await insertFile(designId, "earlier.jpg", 900, "ready");
    const bucket = fakeBucket({
      [model.object_key]: { bytes: 5000, kind: "image" },
      [photo.object_key]: { bytes: 3000, kind: "image", strippedTo: 2600 },
    });

    const outcome = await verifyPendingFiles(admin, bucket, [
      model,
      photo,
      earlier,
    ]);

    assert.deepEqual(outcome, { ready: 2, errors: [] });
    assert.deepEqual(await filesOf(designId), [
      { name: "earlier.jpg", bytes: 900, status: "ready" },
      { name: "edge.stl", bytes: 5000, status: "ready" },
      { name: "wall.jpg", bytes: 2600, status: "ready" },
    ]);
    assert.deepEqual(
      bucket.keys(),
      [model.object_key, ...photoObjectKeys(photo.object_key)].sort(),
    );
  });

  test("a missing, resized or unreadable file is reported and removed with its objects", async () => {
    const designId = await insertDraft();
    const missing = await insertFile(designId, "missing.stl", 5000);
    const resized = await insertFile(designId, "resized.stl", 5000);
    const junk = await insertFile(designId, "junk.jpg", 3000);
    const flaky = await insertFile(designId, "flaky.jpg", 3000);
    const bucket = fakeBucket({
      [resized.object_key]: { bytes: 4999, kind: "image" },
      [junk.object_key]: { bytes: 3000, kind: "junk" },
      [flaky.object_key]: { bytes: 3000, kind: "flaky" },
    });

    const { result, logged } = await capturingErrors(() =>
      verifyPendingFiles(admin, bucket, [missing, resized, junk, flaky]),
    );

    assert.deepEqual(result, {
      ready: 0,
      errors: [
        "missing.stl did not finish uploading.",
        "resized.stl arrived with an unexpected size.",
        "junk.jpg is not a readable image.",
        "flaky.jpg could not be prepared. Try again.",
      ],
    });
    // Only the unexpected failure is logged; a file that is not an image is
    // the uploader's mistake.
    assert.deepEqual(logged, ["photo sizes failed"]);
    assert.deepEqual(await filesOf(designId), []);
    assert.deepEqual(bucket.keys(), []);
  });

  test("the row goes before the object, so a failed delete leaves an orphan for the sweep", async () => {
    const designId = await insertDraft();
    const resized = await insertFile(designId, "resized.stl", 5000);
    const bucket = fakeBucket({
      [resized.object_key]: { bytes: 4999, kind: "image" },
    });
    bucket.deleteObject = async () => {
      throw new Error("bucket unavailable");
    };

    await assert.rejects(
      verifyPendingFiles(admin, bucket, [resized]),
      /bucket unavailable/,
    );
    assert.deepEqual(await filesOf(designId), []);
  });
});

async function insertSession(expiresAt?: Date) {
  const { data, error } = await admin
    .from("phone_sessions")
    .insert({ owner_id: user.id, expires_at: expiresAt?.toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function insertInboxPhoto(sessionId: string, name: string, bytes = 3000) {
  const id = randomUUID();
  const row = {
    id,
    session_id: sessionId,
    object_key: inboxObjectKey(sessionId, id, fileExtension(name)),
    name,
    extension: fileExtension(name),
    bytes,
  };
  const { error } = await admin.from("phone_photos").insert(row);
  if (error) throw error;
  return row;
}

async function inboxOf(sessionId: string) {
  const { data, error } = await admin
    .from("phone_photos")
    .select("name, status")
    .eq("session_id", sessionId)
    .order("name");
  if (error) throw error;
  return data;
}

describe("phone hand-off", () => {
  test("a phone request needs a well-formed, open session", async () => {
    const open = await insertSession();
    const expired = await insertSession(new Date(Date.now() - 60_000));

    assert.equal((await openSession(admin, open))?.id, open);
    assert.equal(await openSession(admin, expired), null);
    assert.equal(await openSession(admin, randomUUID()), null);
    for (const malformed of [
      "",
      "not-a-session",
      `${open}x`,
      "../../designs",
      "-".repeat(36),
    ])
      assert.equal(await openSession(admin, malformed), null, malformed);
  });

  test("a code takes photos of the served types up to the cap", async () => {
    const sessionId = await insertSession();
    const refused = [
      [{ name: "wall.gif", bytes: 3000 }, "wall.gif: photos must be .jpg"],
      [{ name: "empty.jpg", bytes: 0 }, "empty.jpg: photos must be between"],
      [{ name: "huge.jpg", bytes: 10 * 1024 * 1024 + 1 }, "huge.jpg: photos"],
    ] as const;
    for (const [file, message] of refused) {
      const result = await reservePhonePhoto(admin, sessionId, file);
      assert.ok("error" in result && result.error.startsWith(message));
    }

    for (let index = 0; index < MAX_SESSION_PHOTOS; index += 1) {
      const result = await reservePhonePhoto(admin, sessionId, {
        name: `wall-${index}.JPG`,
        bytes: 3000,
      });
      assert.ok("photoId" in result, JSON.stringify(result));
      assert.equal(result.contentType, "image/jpeg");
      assert.equal(
        result.objectKey,
        inboxObjectKey(sessionId, result.photoId, "jpg"),
      );
    }
    assert.deepEqual(
      await reservePhonePhoto(admin, sessionId, {
        name: "one-more.jpg",
        bytes: 3000,
      }),
      { error: `That's the limit of ${MAX_SESSION_PHOTOS} photos per code.` },
    );
    const inbox = await inboxOf(sessionId);
    assert.equal(inbox.length, MAX_SESSION_PHOTOS);
    assert.ok(inbox.every((photo) => photo.status === "pending"));

    const expired = await insertSession(new Date(Date.now() - 60_000));
    assert.deepEqual(
      await reservePhonePhoto(admin, expired, { name: "a.jpg", bytes: 3000 }),
      { error: "This code has expired. Scan a new one." },
    );
    assert.deepEqual(await inboxOf(expired), []);
  });

  test("confirming a photo checks the session, the size and the bytes", async () => {
    const sessionId = await insertSession();
    const good = await insertInboxPhoto(sessionId, "good.jpg");
    const missing = await insertInboxPhoto(sessionId, "missing.jpg");
    const resized = await insertInboxPhoto(sessionId, "resized.jpg");
    const junk = await insertInboxPhoto(sessionId, "junk.jpg");
    const flaky = await insertInboxPhoto(sessionId, "flaky.jpg");
    const otherSession = await insertSession();
    const elsewhere = await insertInboxPhoto(otherSession, "elsewhere.jpg");
    const bucket = fakeBucket({
      [good.object_key]: { bytes: 3000, kind: "image" },
      [resized.object_key]: { bytes: 2999, kind: "image" },
      [junk.object_key]: { bytes: 3000, kind: "junk" },
      [flaky.object_key]: { bytes: 3000, kind: "flaky" },
      [elsewhere.object_key]: { bytes: 3000, kind: "image" },
    });
    const confirm = (photoId: string, session = sessionId) =>
      verifyPhonePhoto(admin, bucket, session, photoId);

    assert.deepEqual(await confirm(good.id), { ok: true });
    assert.deepEqual(await confirm(missing.id), {
      error: "missing.jpg did not finish uploading.",
    });
    assert.deepEqual(await confirm(resized.id), {
      error: "resized.jpg arrived with an unexpected size.",
    });
    assert.deepEqual(await confirm(junk.id), {
      error: "junk.jpg is not a readable image.",
    });
    const { result, logged } = await capturingErrors(() => confirm(flaky.id));
    assert.deepEqual(result, {
      error: "flaky.jpg could not be checked. Try again.",
    });
    assert.deepEqual(logged, ["phone photo check failed"]);
    assert.deepEqual(await confirm(elsewhere.id), {
      error: "This photo could not be found.",
    });
    assert.deepEqual(await confirm(randomUUID()), {
      error: "This photo could not be found.",
    });

    // A photo that never arrived keeps its row for the sweep, in case its
    // upload is still finishing; the refused ones are gone with their bytes.
    assert.deepEqual(await inboxOf(sessionId), [
      { name: "good.jpg", status: "ready" },
      { name: "missing.jpg", status: "pending" },
    ]);
    assert.deepEqual(
      bucket.keys(),
      [good.object_key, elsewhere.object_key].sort(),
    );

    await admin
      .from("phone_sessions")
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", otherSession);
    assert.deepEqual(await confirm(elsewhere.id, otherSession), {
      error: "This code has expired. Scan a new one.",
    });
    assert.deepEqual(await inboxOf(otherSession), [
      { name: "elsewhere.jpg", status: "pending" },
    ]);
  });

  test("attaching moves photos under the design and drops one whose sizes fail", async () => {
    const designId = await insertDraft();
    const sessionId = await insertSession();
    const good = await insertInboxPhoto(sessionId, "good.jpg");
    const flaky = await insertInboxPhoto(sessionId, "flaky.jpg");
    const bucket = fakeBucket({
      [good.object_key]: { bytes: 3000, kind: "image", strippedTo: 2800 },
      [flaky.object_key]: { bytes: 3000, kind: "flaky" },
    });

    const { result: attached, logged } = await capturingErrors(() =>
      attachInboxPhotos(admin, bucket, designId, [good, flaky], 4),
    );

    assert.equal(attached, 1);
    assert.deepEqual(logged, ["phone photo sizes failed"]);
    const { data: files } = await admin
      .from("design_files")
      .select("object_key, name, bytes, position, status")
      .eq("design_id", designId);
    assert.equal(files?.length, 1);
    const [file] = files!;
    assert.deepEqual(
      { ...file, object_key: undefined },
      {
        object_key: undefined,
        name: "good.jpg",
        bytes: 2800,
        position: 4,
        status: "ready",
      },
    );
    assert.ok(file.object_key.startsWith(`designs/${designId}/`));
    // The inbox is emptied either way, and the failed copy leaves no sizes.
    assert.deepEqual(await inboxOf(sessionId), []);
    assert.deepEqual(bucket.keys(), photoObjectKeys(file.object_key).sort());
  });
});
