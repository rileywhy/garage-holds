import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import {
  deleteAccountPreset,
  loadAccountPresets,
  renameAccountPreset,
  saveAccountPreset,
} from "../../src/features/lab-presets/account-presets";
import {
  PRESET_LABS,
  PRESET_LIMIT,
  type PresetLab,
} from "../../src/features/lab-presets/saved-presets";
import {
  adminClient,
  anonymousClient,
  createUser,
  deleteUser,
  type TestUser,
} from "./stack";

// Lab presets on the account. Row-level security decides whose rows they
// are and the table checks the lab and the sizes; the limit per lab and one
// name per lab are kept by account-presets.ts alone (RIL-74). Every call
// runs as a signed-in user, as the server actions do.

const RLS_VIOLATION = "42501";
const CHECK_VIOLATION = "23514";

const admin = adminClient();
let owner: TestUser;
let other: TestUser;

before(async () => {
  owner = await createUser(admin, "preset-owner");
  other = await createUser(admin, "preset-other");
});

after(async () => {
  if (owner) await deleteUser(admin, owner);
  if (other) await deleteUser(admin, other);
});

const names = (presets: { name: string }[]) => presets.map((p) => p.name);

test("presets are private to their owner", async () => {
  const [rail] = await saveAccountPreset(
    owner.client,
    owner.id,
    "crimp",
    "Rail",
    "?edge_depth=20",
  );

  // Another person reaches none of it, even by id.
  const seen = await other.client
    .from("lab_presets")
    .select("id")
    .eq("id", rail.id);
  assert.deepEqual(seen.data, []);
  await renameAccountPreset(other.client, other.id, "crimp", rail.id, "Mine");
  await deleteAccountPreset(other.client, other.id, "crimp", rail.id);
  const kept = await loadAccountPresets(owner.client, owner.id, "crimp");
  assert.deepEqual(
    kept.map((p) => [p.name, p.search]),
    [["Rail", "?edge_depth=20"]],
  );

  const forged = await other.client
    .from("lab_presets")
    .insert({ owner_id: owner.id, lab: "crimp", name: "Forged" });
  assert.equal(forged.error?.code, RLS_VIOLATION);
  const moved = await owner.client
    .from("lab_presets")
    .update({ owner_id: other.id })
    .eq("id", rail.id);
  assert.equal(moved.error?.code, RLS_VIOLATION);
  const visitor = await anonymousClient().from("lab_presets").select("id");
  assert.equal(visitor.error?.code, RLS_VIOLATION);
});

test("every lab the app saves for is one the table accepts", async () => {
  for (const lab of PRESET_LABS) {
    const presets = await saveAccountPreset(
      other.client,
      other.id,
      lab,
      "Starter",
      "",
    );
    assert.deepEqual(names(presets), ["Starter"], lab);
  }
});

test("the table refuses unknown labs and oversized names or links", async () => {
  for (const row of [
    { lab: "rocket", name: "Rocket", search: "" },
    { lab: "crimp", name: "", search: "" },
    { lab: "crimp", name: "x".repeat(41), search: "" },
    { lab: "crimp", name: "Detailed", search: `?${"x".repeat(6000)}` },
  ]) {
    const { error } = await owner.client
      .from("lab_presets")
      .insert({ owner_id: owner.id, ...row });
    assert.equal(error?.code, CHECK_VIOLATION, row.name || "empty name");
  }
  await assert.rejects(
    loadAccountPresets(owner.client, owner.id, "rocket" as PresetLab),
    { message: "Unknown lab." },
  );
  await assert.rejects(
    saveAccountPreset(owner.client, owner.id, "crimp", "Bare", "edge=20"),
    { message: "A preset must be a lab link." },
  );
});

test(`a lab holds ${PRESET_LIMIT} presets, and saving an existing name replaces it`, async () => {
  const maker = await createUser(admin, "preset-limit");
  const save = (lab: PresetLab, name: string, search = "") =>
    saveAccountPreset(maker.client, maker.id, lab, name, search);
  try {
    for (let number = 1; number <= PRESET_LIMIT; number += 1)
      await save("jug", `Jug ${number}`, `?width=${100 + number}`);
    await assert.rejects(save("jug", "One more"), {
      message: `You have ${PRESET_LIMIT} presets in this lab. Delete one to make room.`,
    });

    // A full lab still takes a save under a name it has, in any case.
    const replaced = await save("jug", "  jug   7 ", "?width=777");
    assert.equal(replaced.length, PRESET_LIMIT);
    assert.equal(
      replaced.find((p) => p.name === "jug 7")?.search,
      "?width=777",
    );
    // Other labs have room of their own, and deleting one makes room here.
    assert.equal((await save("sloper", "One more")).length, 1);
    await deleteAccountPreset(maker.client, maker.id, "jug", replaced[0].id);
    assert.equal((await save("jug", "One more")).length, PRESET_LIMIT);
  } finally {
    await deleteUser(admin, maker);
  }
});

test("names are unique within a lab, ignoring case", async () => {
  await saveAccountPreset(
    owner.client,
    owner.id,
    "foot",
    "Chip",
    "?shape=edge",
  );
  const [ball] = await saveAccountPreset(
    owner.client,
    owner.id,
    "foot",
    "Ball",
    "?shape=ball",
  );
  await assert.rejects(
    renameAccountPreset(owner.client, owner.id, "foot", ball.id, " CHIP "),
    { message: "You already have a preset called “CHIP”." },
  );
  const renamed = await renameAccountPreset(
    owner.client,
    owner.id,
    "foot",
    ball.id,
    "BALL",
  );
  assert.deepEqual(names(renamed), ["BALL", "Chip"]);

  // The same name in another lab is a different preset.
  await saveAccountPreset(owner.client, owner.id, "pocket", "Chip", "");
  assert.deepEqual(
    names(await loadAccountPresets(owner.client, owner.id, "foot")),
    ["BALL", "Chip"],
  );
});
