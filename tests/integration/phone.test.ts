import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import {
  adminClient,
  anonymousClient,
  createUser,
  deleteUser,
  type TestUser,
} from "./stack";

// Phone hand-off sessions: who can start one, and who can see the photos
// that arrive. The phone itself goes through the service role, so only the
// signed-in owner's view is subject to these policies.

const RLS_VIOLATION = "42501";

const admin = adminClient();
let owner: TestUser;
let other: TestUser;
let designId: string;
let sessionId: string;

before(async () => {
  owner = await createUser(admin, "phone-owner");
  other = await createUser(admin, "phone-other");
  const { data, error } = await owner.client
    .from("designs")
    .insert({
      owner_id: owner.id,
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
  designId = data.id;
});

after(async () => {
  if (owner) await deleteUser(admin, owner);
  if (other) await deleteUser(admin, other);
});

test("a session can be started for oneself, optionally for one's own design", async () => {
  const forged = await owner.client
    .from("phone_sessions")
    .insert({ owner_id: other.id });
  assert.equal(forged.error?.code, RLS_VIOLATION);

  const othersDesign = await other.client
    .from("phone_sessions")
    .insert({ owner_id: other.id, design_id: designId });
  assert.equal(othersDesign.error?.code, RLS_VIOLATION);

  const { data, error } = await owner.client
    .from("phone_sessions")
    .insert({ owner_id: owner.id, design_id: designId })
    .select("id, expires_at")
    .single();
  assert.equal(error, null);
  assert.ok(Date.parse(data!.expires_at) > Date.now());
  sessionId = data!.id;
});

test("photos are recorded by the server and visible to the owner alone", async () => {
  const byOwner = await owner.client.from("phone_photos").insert({
    session_id: sessionId,
    object_key: `inbox/${sessionId}/forged.jpg`,
    name: "forged.jpg",
    extension: "jpg",
    bytes: 10,
  });
  assert.equal(byOwner.error?.code, RLS_VIOLATION);

  const recorded = await admin.from("phone_photos").insert({
    session_id: sessionId,
    object_key: `inbox/${sessionId}/wall.jpg`,
    name: "wall.jpg",
    extension: "jpg",
    bytes: 2048,
    status: "ready",
  });
  assert.equal(recorded.error, null);

  const owners = await owner.client
    .from("phone_photos")
    .select("name")
    .eq("session_id", sessionId);
  assert.deepEqual(owners.data, [{ name: "wall.jpg" }]);

  const others = await other.client
    .from("phone_photos")
    .select("name")
    .eq("session_id", sessionId);
  assert.deepEqual(others.data, []);

  const visitor = await anonymousClient()
    .from("phone_photos")
    .select("name")
    .eq("session_id", sessionId);
  assert.equal(visitor.error?.code, RLS_VIOLATION);
});

test("ending a session takes its photos with it", async () => {
  const byOther = await other.client
    .from("phone_sessions")
    .delete()
    .eq("id", sessionId)
    .select("id");
  assert.deepEqual(byOther.data, []);

  const ended = await owner.client
    .from("phone_sessions")
    .delete()
    .eq("id", sessionId)
    .select("id");
  assert.deepEqual(ended.data, [{ id: sessionId }]);

  const { count } = await admin
    .from("phone_photos")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  assert.equal(count, 0);
});
