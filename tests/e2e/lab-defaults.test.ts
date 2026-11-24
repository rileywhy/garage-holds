import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import {
  loadSchema,
  post,
  type Kind,
  type Parameters,
  type Preview,
} from "../../src/features/hold-lab/api";
import {
  GENERATORS,
  GENERATOR_LABS,
  generatorEnvName,
} from "../../src/features/labs/labs";
import { followPreview } from "../../src/features/hold-lab/kinds";
import { linkSearch } from "../../src/features/lab-link/lab-link";

// Each lab's default output, end to end against the real generators: the
// first preview a lab shows for its defaults, the settings its sliders then
// hold, the link it writes, and the STL its Export button downloads. The
// expected values live in tests/fixtures/lab-defaults.json; the test fails
// when any of them moves, whether the lab or the generator changed.
//
// Needs the generators from docs/sandbox.md (npm run test:e2e). After an
// intended generator change, UPDATE_LAB_DEFAULTS=1 rewrites the fixture.

const FIXTURE = fileURLToPath(
  new URL("../fixtures/lab-defaults.json", import.meta.url),
);

// A lab calls /api/<kind> on its own site, which next.config.ts forwards to
// the generator; here the generator is called directly.
const siteFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const path = String(input);
  const kind = path.match(/^\/api\/(\w+)$/)?.[1] as Kind | undefined;
  if (!kind || !Object.hasOwn(GENERATORS, kind)) return siteFetch(input, init);
  const base =
    process.env[generatorEnvName(kind)] ??
    `http://127.0.0.1:${GENERATORS[kind].port}`;
  return siteFetch(base.replace(/\/$/, "") + path, init);
};

interface DefaultOutput {
  dimensions: number[];
  triangles: number;
  screws: number;
  status: string;
  search: string;
  sliders: Parameters;
  stlBytes: number;
}

async function defaultOutput(kind: Kind): Promise<DefaultOutput> {
  const schema = await loadSchema(kind);
  const preview = (await (
    await post(kind, "preview", { ...schema.defaults })
  ).json()) as Preview;
  const outcome = followPreview(
    kind,
    { ...schema.defaults },
    preview,
    schema.controls,
  );
  const stl = Buffer.from(
    await (
      await post(kind, "stl", { ...preview.design.parameters })
    ).arrayBuffer(),
  );
  assert.ok(stl.length >= 84, "expected a binary STL header");
  const stlTriangles = stl.readUInt32LE(80);
  assert.ok(stlTriangles > 0, "expected STL triangles");
  assert.equal(stl.length, 84 + stlTriangles * 50);
  return {
    dimensions: preview.dimensions,
    triangles: preview.triangles,
    screws: preview.screws.length,
    status: outcome.text,
    search: linkSearch(outcome.parameters, schema.defaults, schema.presets),
    sliders: outcome.parameters,
    stlBytes: stl.length,
  };
}

const update = process.env.UPDATE_LAB_DEFAULTS === "1";
const expected: Partial<Record<Kind, DefaultOutput>> =
  !update && existsSync(FIXTURE)
    ? JSON.parse(readFileSync(FIXTURE, "utf8"))
    : {};
const seen: Partial<Record<Kind, DefaultOutput>> = {};

for (const { slug: kind } of GENERATOR_LABS)
  test(`${kind}: the default shape, its settings and its STL are what they were`, async () => {
    const actual = await defaultOutput(kind);
    seen[kind] = actual;
    if (update) return;
    assert.ok(expected[kind], `no expected output for ${kind} in ${FIXTURE}`);
    const { triangles, stlBytes, ...settings } = actual;
    const {
      triangles: expectedTriangles,
      stlBytes: expectedBytes,
      ...expectedSettings
    } = expected[kind];
    assert.deepEqual(settings, expectedSettings);
    // Native mesh generation can triangulate the same shape slightly
    // differently across platforms. Keep a tight bound on the mesh sizes.
    assert.ok(
      Math.abs(triangles - expectedTriangles) <= 4,
      "preview triangle count changed",
    );
    assert.ok(Math.abs(stlBytes - expectedBytes) <= 200, "STL size changed");
  });

after(() => {
  if (update) writeFileSync(FIXTURE, JSON.stringify(seen, null, 2) + "\n");
});
