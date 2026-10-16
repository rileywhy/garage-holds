import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import {
  adminClient,
  createUser,
  deleteUser,
  type Client,
  type TestUser,
} from "./stack";

// The upload allowance is enforced by database triggers, so parallel
// inserts cannot slip past the server's own check (RIL-35). These run on a
// local Supabase stack, as the signed-in user where the app would, and as
// the service role where the server writes file rows.

const CHECK_VIOLATION = "23514";

const design = {
  title: "Allowance test edge",
  description: "A crisp incut edge for steep boards, tested on a 40.",
  hold_type: "Crimp",
  size: "Medium",
  mounting: "Screw-on",
  tags: ["crimp"],
  license: "CC BY 4.0",
  design_method: "human-shaped",
  material: "PETG",
};

const admin: Client = adminClient();
let person: TestUser;

before(async () => {
  person = await createUser(admin, "allowance");
});

after(async () => {
  if (person) await deleteUser(admin, person);
});

describe("upload allowance triggers", () => {
  test("the design count stops at the limit, even for parallel inserts", async () => {
    await admin
      .from("profiles")
      .update({ upload_limit_designs: 2 })
      .eq("id", person.id)
      .throwOnError();
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        person.client
          .from("designs")
          .insert({ ...design, owner_id: person.id }),
      ),
    );
    const refused = attempts.filter((result) => result.error);
    assert.equal(attempts.length - refused.length, 2);
    for (const result of refused)
      assert.equal(result.error?.code, CHECK_VIOLATION, result.error?.message);
  });

  test("the byte total stops at the limit", async () => {
    await admin
      .from("profiles")
      .update({ upload_limit_bytes: 30000 })
      .eq("id", person.id)
      .throwOnError();
    const { data: rows } = await admin
      .from("designs")
      .select("id")
      .eq("owner_id", person.id)
      .limit(1)
      .throwOnError();
    const designId = rows![0].id;
    const file = (bytes: number, name: string) => ({
      design_id: designId,
      kind: "model",
      object_key: `designs/${designId}/${name}`,
      name,
      extension: "stl",
      bytes,
      status: "pending",
      position: 0,
    });
    const first = await admin.from("design_files").insert(file(24000, "a.stl"));
    assert.equal(first.error, null);
    const second = await admin
      .from("design_files")
      .insert(file(10000, "b.stl"));
    assert.equal(second.error?.code, CHECK_VIOLATION, second.error?.message);
    const third = await admin.from("design_files").insert(file(6000, "c.stl"));
    assert.equal(third.error, null);
  });

  test("a phone code takes no more than its cap of photos", async () => {
    const { data: session } = await person.client
      .from("phone_sessions")
      .insert({ owner_id: person.id })
      .select("id")
      .single()
      .throwOnError();
    const photo = (index: number) => ({
      session_id: session!.id,
      object_key: `inbox/${session!.id}/${index}.jpg`,
      name: `${index}.jpg`,
      extension: "jpg",
      bytes: 1000,
    });
    const results = await Promise.all(
      Array.from({ length: 14 }, (_, index) =>
        admin.from("phone_photos").insert(photo(index)),
      ),
    );
    const refused = results.filter((result) => result.error);
    assert.equal(results.length - refused.length, 12);
    for (const result of refused)
      assert.equal(result.error?.code, CHECK_VIOLATION, result.error?.message);
  });
});
