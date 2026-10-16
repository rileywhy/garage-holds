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
import {
  applyCatalogQuery,
  CATALOG_PAGE_SIZE,
  DEFAULT_CATALOG_QUERY,
  type CatalogQuery,
} from "../../src/features/holds/catalog-query";

// The catalog's search, filters and pages run in the database (RIL-25).
// A visitor queries a local Supabase stack the way the home page does,
// through applyCatalogQuery, against designs published by a test user.

const admin: Client = adminClient();
const visitor = anonymousClient();
let maker: TestUser;
// Titles carry a marker so these tests never match whatever else the local
// stack holds, and never count it.
const marker = `catalogtest${Date.now().toString(36)}`;
const TOTAL = CATALOG_PAGE_SIZE + 3;

async function page(query: Partial<CatalogQuery>, pageNumber = 1) {
  const from = (pageNumber - 1) * CATALOG_PAGE_SIZE;
  const full = { ...DEFAULT_CATALOG_QUERY, ...query, page: pageNumber };
  const { data, error, count } = await applyCatalogQuery(
    visitor.from("designs").select("title, hold_type", { count: "exact" }),
    { ...full, query: `${marker} ${full.query}` },
  ).range(from, from + CATALOG_PAGE_SIZE - 1);
  assert.equal(error, null, error?.message);
  return { titles: data!.map((row) => row.title), total: count ?? 0 };
}

before(async () => {
  maker = await createUser(admin, "catalog");
  await admin
    .from("profiles")
    .update({
      upload_limit_designs: TOTAL + 1,
      display_name: `Maker ${marker}`,
    })
    .eq("id", maker.id)
    .throwOnError();
  for (let index = 0; index < TOTAL; index += 1) {
    const { data } = await maker.client
      .from("designs")
      .insert({
        owner_id: maker.id,
        title: `${marker} design ${String(index).padStart(2, "0")}`,
        description: `Design number ${index} of the ${marker} batch, with ${index % 2 ? "fuzzy skin" : "a smooth top"} for the tests.`,
        hold_type: index % 3 ? "Crimp" : "Jug",
        size: "Medium",
        mounting: "Screw-on",
        problem_grade: index % 4 ? null : 5,
        tags: [index % 5 ? "board" : "warmup"],
        license: "CC BY 4.0",
        design_method: index % 2 ? "generated" : "human-shaped",
        material: index % 3 ? "PETG" : "PETG-CF",
      })
      .select("id")
      .single()
      .throwOnError();
    const designId = data!.id;
    // Publishing needs a verified model file; file rows are the server's.
    await admin
      .from("design_files")
      .insert({
        design_id: designId,
        kind: "model",
        object_key: `designs/${designId}/model.stl`,
        name: "model.stl",
        extension: "stl",
        bytes: 1000 + index,
        status: "ready",
      })
      .throwOnError();
    // Published in order, a moment apart, so "featured" has a stable order.
    await maker.client
      .from("designs")
      .update({ status: "published" })
      .eq("id", designId)
      .throwOnError();
  }
  // The last design is left as a draft: it must never appear.
  await maker.client
    .from("designs")
    .insert({
      owner_id: maker.id,
      title: `${marker} draft`,
      description: `A draft in the ${marker} batch that no visitor should see.`,
      hold_type: "Jug",
      size: "Large",
      mounting: "Bolt-on",
      tags: [],
      license: "CC BY 4.0",
      design_method: "generated",
      material: "PETG",
    })
    .throwOnError();
});

after(async () => {
  if (maker) await deleteUser(admin, maker);
});

describe("catalog in the database", () => {
  test("pages cover the published designs once each, drafts never", async () => {
    const first = await page({});
    const second = await page({}, 2);
    assert.equal(first.total, TOTAL);
    assert.equal(first.titles.length, CATALOG_PAGE_SIZE);
    assert.equal(second.titles.length, TOTAL - CATALOG_PAGE_SIZE);
    const seen = new Set([...first.titles, ...second.titles]);
    assert.equal(seen.size, TOTAL);
    assert.ok(!seen.has(`${marker} draft`));
    // Featured is newest-published first.
    assert.equal(first.titles[0], `${marker} design ${TOTAL - 1}`);
    assert.equal(second.titles.at(-1), `${marker} design 00`);
  });

  test("search matches word prefixes in text, tags and the creator's name", async () => {
    assert.equal((await page({ query: "fuzz ski" })).total, TOTAL >> 1);
    assert.equal((await page({ query: "warmup" })).total, 6);
    assert.equal((await page({ query: "petg-cf" })).total, 9);
    assert.equal((await page({ query: "petg" })).total, TOTAL);
    assert.equal((await page({ query: `mak ${marker}` })).total, TOTAL);
    assert.equal((await page({ query: "design 07" })).total, 1);
    assert.equal((await page({ query: "nothing-like-this" })).total, 0);
  });

  test("filters combine, and sorting by name is alphabetical", async () => {
    assert.equal((await page({ types: ["Jug"] })).total, 9);
    assert.equal(
      (await page({ types: ["Jug"], designMethod: "generated" })).total,
      4,
    );
    assert.equal((await page({ targetGrade: 5 })).total, 7);
    assert.equal((await page({ materials: ["PLA"] })).total, 0);
    const byName = await page({ sort: "title" });
    assert.equal(byName.titles[0], `${marker} design 00`);
    assert.deepEqual(byName.titles, [...byName.titles].sort());
  });
});
