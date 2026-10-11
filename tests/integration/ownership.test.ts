import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import {
  adminClient,
  anonymousClient,
  createUser,
  deleteUser,
  type Client,
  type TestUser,
} from "./stack";

// Two people and a visitor against the real policies in
// supabase/migrations, on a local Supabase stack. Each query runs as the
// signed-in user, exactly as the app's server client does, so these tests
// prove what row-level security allows rather than what the app happens to
// ask for.

const RLS_VIOLATION = "42501";
const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";

const draftInput = {
  title: "Mesa edge",
  description: "A crisp incut edge for steep boards, tested on a 40.",
  hold_type: "Crimp",
  size: "Medium",
  mounting: "Screw-on",
  problem_grade: 5,
  tags: ["crimp"],
  license: "CC BY 4.0",
  material: "PETG-CF",
};

const admin: Client = adminClient();
let owner: TestUser;
let other: TestUser;
let visitor: Client;
let designId: string;

before(async () => {
  owner = await createUser(admin, "owner");
  other = await createUser(admin, "other");
  visitor = anonymousClient();
});

after(async () => {
  // Deleting the auth users cascades through profiles to every row they own.
  if (owner) await deleteUser(admin, owner);
  if (other) await deleteUser(admin, other);
});

describe("drafts", () => {
  test("a design can only be created for oneself, and starts as a draft", async () => {
    const forged = await owner.client
      .from("designs")
      .insert({ ...draftInput, owner_id: other.id });
    assert.equal(forged.error?.code, RLS_VIOLATION);

    const { data, error } = await owner.client
      .from("designs")
      .insert({ ...draftInput, owner_id: owner.id, status: "published" })
      .select("id, status, published_at")
      .single();
    assert.equal(error, null);
    assert.equal(data?.status, "draft");
    assert.equal(data?.published_at, null);
    designId = data!.id;
  });

  test("a draft is visible to its owner only", async () => {
    const own = await owner.client
      .from("designs")
      .select("id")
      .eq("id", designId)
      .maybeSingle();
    assert.equal(own.data?.id, designId);

    const theirs = await other.client
      .from("designs")
      .select("id")
      .eq("id", designId)
      .maybeSingle();
    assert.equal(theirs.data, null);

    const anonymous = await visitor
      .from("designs")
      .select("id")
      .eq("id", designId)
      .maybeSingle();
    assert.equal(anonymous.data, null);
  });

  test("another user cannot change or delete someone else's design", async () => {
    const updated = await other.client
      .from("designs")
      .update({ title: "Stolen edge" })
      .eq("id", designId)
      .select("id");
    assert.equal(updated.error, null);
    assert.deepEqual(updated.data, []);

    const deleted = await other.client
      .from("designs")
      .delete()
      .eq("id", designId)
      .select("id");
    assert.equal(deleted.error, null);
    assert.deepEqual(deleted.data, []);

    const { data } = await owner.client
      .from("designs")
      .select("title")
      .eq("id", designId)
      .single();
    assert.equal(data?.title, "Mesa edge");
  });

  test("the owner can edit metadata but not reassign ownership", async () => {
    const edited = await owner.client
      .from("designs")
      .update({ title: "Mesa edge v2" })
      .eq("id", designId)
      .select("title")
      .single();
    assert.equal(edited.data?.title, "Mesa edge v2");

    const reassigned = await owner.client
      .from("designs")
      .update({ owner_id: other.id })
      .eq("id", designId);
    assert.equal(reassigned.error?.code, RLS_VIOLATION);
  });
});

describe("files and publication", () => {
  test("users cannot register or remove files themselves", async () => {
    const { error } = await owner.client.from("design_files").insert({
      design_id: designId,
      kind: "model",
      object_key: `designs/${designId}/forged.stl`,
      name: "forged.stl",
      extension: "stl",
      bytes: 10,
    });
    assert.equal(error?.code, RLS_VIOLATION);
    const removed = await owner.client
      .from("design_files")
      .delete()
      .eq("design_id", designId);
    assert.equal(removed.error?.code, RLS_VIOLATION);
  });

  test("publishing is refused until a model file is verified", async () => {
    const premature = await owner.client
      .from("designs")
      .update({ status: "published" })
      .eq("id", designId);
    assert.equal(premature.error?.code, CHECK_VIOLATION);

    const registered = await admin.from("design_files").insert({
      design_id: designId,
      kind: "model",
      object_key: `designs/${designId}/model.stl`,
      name: "mesa edge.stl",
      extension: "stl",
      bytes: 50_000,
      status: "ready",
    });
    assert.equal(registered.error, null);

    const published = await owner.client
      .from("designs")
      .update({ status: "published" })
      .eq("id", designId)
      .select("status, published_at")
      .single();
    assert.equal(published.data?.status, "published");
    assert.ok(published.data?.published_at);
  });

  test("a published design and its files are visible to everyone", async () => {
    for (const client of [other.client, visitor]) {
      const { data } = await client
        .from("designs")
        .select("id, design_files(name)")
        .eq("id", designId)
        .maybeSingle();
      assert.equal(data?.id, designId);
      assert.deepEqual(data?.design_files, [{ name: "mesa edge.stl" }]);
    }
  });
});

const review = {
  rating: 4,
  body: "Printed well in PETG-CF.",
};

describe("reviews", () => {
  let reviewId: string;

  test("only published designs can be reviewed, once per person", async () => {
    const draft = await owner.client
      .from("designs")
      .insert({ ...draftInput, owner_id: owner.id, title: "Second draft" })
      .select("id")
      .single();
    const onDraft = await other.client
      .from("reviews")
      .insert({ ...review, design_id: draft.data!.id, author_id: other.id });
    assert.equal(onDraft.error?.code, RLS_VIOLATION);

    const forged = await other.client
      .from("reviews")
      .insert({ ...review, design_id: designId, author_id: owner.id });
    assert.equal(forged.error?.code, RLS_VIOLATION);

    const { data, error } = await other.client
      .from("reviews")
      .insert({ ...review, design_id: designId, author_id: other.id })
      .select("id")
      .single();
    assert.equal(error, null);
    reviewId = data!.id;

    const again = await other.client
      .from("reviews")
      .insert({ ...review, design_id: designId, author_id: other.id });
    assert.equal(again.error?.code, UNIQUE_VIOLATION);
  });

  test("a review can be edited by its author alone", async () => {
    const byOwner = await owner.client
      .from("reviews")
      .update({ body: "The creator rewrote this." })
      .eq("id", reviewId)
      .select("id");
    assert.deepEqual(byOwner.data, []);

    const byAuthor = await other.client
      .from("reviews")
      .update({ body: "Printed well, holds up on a 40." })
      .eq("id", reviewId)
      .select("body")
      .single();
    assert.equal(byAuthor.data?.body, "Printed well, holds up on a 40.");

    const seen = await visitor
      .from("reviews")
      .select("body, profiles!reviews_author_id_fkey(display_name)")
      .eq("id", reviewId)
      .single();
    assert.equal(seen.data?.body, "Printed well, holds up on a 40.");
    assert.ok(seen.data?.profiles?.display_name);
  });
});

describe("bookmarks", () => {
  test("bookmarks cover visible designs and are private", async () => {
    const saved = await other.client
      .from("bookmarks")
      .insert({ owner_id: other.id, design_id: designId });
    assert.equal(saved.error, null);

    const ownDraft = await owner.client
      .from("designs")
      .select("id")
      .eq("title", "Second draft")
      .single();
    const hidden = await other.client
      .from("bookmarks")
      .insert({ owner_id: other.id, design_id: ownDraft.data!.id });
    assert.equal(hidden.error?.code, RLS_VIOLATION);

    const ownersView = await owner.client.from("bookmarks").select("design_id");
    assert.deepEqual(ownersView.data, []);
    const othersView = await other.client.from("bookmarks").select("design_id");
    assert.deepEqual(othersView.data, [{ design_id: designId }]);
  });
});

describe("deletion", () => {
  test("deleting one's own design takes its files, reviews, and bookmarks with it", async () => {
    const { data: design } = await owner.client
      .from("designs")
      .insert({ ...draftInput, owner_id: owner.id, title: "Doomed edge" })
      .select("id")
      .single();
    const id = design!.id;
    await admin.from("design_files").insert({
      design_id: id,
      kind: "model",
      object_key: `designs/${id}/model.stl`,
      name: "doomed.stl",
      extension: "stl",
      bytes: 10,
      status: "ready",
    });
    await owner.client
      .from("designs")
      .update({ status: "published" })
      .eq("id", id);
    await other.client
      .from("reviews")
      .insert({ ...review, design_id: id, author_id: other.id });
    await other.client
      .from("bookmarks")
      .insert({ owner_id: other.id, design_id: id });

    const byOther = await other.client
      .from("designs")
      .delete()
      .eq("id", id)
      .select("id");
    assert.deepEqual(byOther.data, []);

    const byOwner = await owner.client
      .from("designs")
      .delete()
      .eq("id", id)
      .select("id");
    assert.deepEqual(byOwner.data, [{ id }]);
    for (const table of ["design_files", "reviews", "bookmarks"] as const) {
      const { count } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("design_id", id);
      assert.equal(count, 0, table);
    }
  });
});

describe("feedback", () => {
  test("feedback rows are written and read by the server only", async () => {
    const row = { body: "The preview is upside down.", page: "/holds/x" };
    const byUser = await owner.client.from("feedback").insert(row);
    assert.equal(byUser.error?.code, RLS_VIOLATION);
    const byVisitor = await visitor.from("feedback").select("id");
    assert.equal(byVisitor.error?.code, RLS_VIOLATION);
    const byServer = await admin
      .from("feedback")
      .insert({ ...row, author_id: owner.id })
      .select("id")
      .single();
    assert.equal(byServer.error, null);
    await admin.from("feedback").delete().eq("id", byServer.data!.id);
  });
});

describe("profiles", () => {
  test("profiles are public, editable by their owner, and uniquely named", async () => {
    const { data: profiles } = await visitor
      .from("profiles")
      .select("id, display_name")
      .in("id", [owner.id, other.id]);
    assert.equal(profiles?.length, 2);
    const ownerName = profiles!.find((p) => p.id === owner.id)!.display_name;

    const byOther = await other.client
      .from("profiles")
      .update({ display_name: "Impostor" })
      .eq("id", owner.id)
      .select("id");
    assert.deepEqual(byOther.data, []);

    const taken = await other.client
      .from("profiles")
      .update({ display_name: ownerName.toUpperCase() })
      .eq("id", other.id);
    assert.equal(taken.error?.code, UNIQUE_VIOLATION);

    const raised = await other.client
      .from("profiles")
      .update({ upload_limit_designs: 1000 })
      .eq("id", other.id);
    assert.equal(raised.error?.code, RLS_VIOLATION);

    const renamed = await other.client
      .from("profiles")
      .update({ display_name: "Other Maker", bio: "Prints on a 40." })
      .eq("id", other.id)
      .select("display_name, bio")
      .single();
    assert.deepEqual(renamed.data, {
      display_name: "Other Maker",
      bio: "Prints on a 40.",
    });
  });
});
