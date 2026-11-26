import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import nextConfig from "../next.config";
import type { trackEvent } from "../src/features/analytics/events";
import { KIND_LABELS } from "../src/features/hold-lab/api";
import { LAB_KINDS } from "../src/features/hold-lab/kinds";
import {
  PRESET_LABS,
  PRESET_LAB_NAMES,
} from "../src/features/lab-presets/saved-presets";
import { LabNav } from "../src/features/labs/lab-nav";
import { ALL_LABS, LABS, type LabSlug } from "../src/features/labs/labs";
import { CLIENT_ROUTES } from "../src/lib/error-reports";

// Every lab with a page; the listed ones are on the cards and in the nav.
const slugs = ALL_LABS.map(({ slug }) => slug);
const listedSlugs = LABS.map(({ slug }) => slug);
const generators = ALL_LABS.flatMap(({ slug, generator, label }) =>
  generator ? [{ ...generator, slug, label }] : [],
);
const generatorSlugs = generators.map(({ slug }) => slug);
const read = (path: string) => readFileSync(path, "utf8");

test("lab routes, navigation and presets agree with LABS", () => {
  assert.equal(new Set(slugs).size, slugs.length, "duplicate lab slug");
  const hrefs = ALL_LABS.map(({ href }) => href);
  const nav = renderToStaticMarkup(createElement(LabNav, { current: "" }));
  const links = [...nav.matchAll(/href="([^"]+)"/g)].map(([, href]) => href);
  assert.deepEqual(links, [
    "/make",
    ...LABS.map(({ href }) => href),
    "/make/texture",
  ]);
  assert.deepEqual(
    CLIENT_ROUTES.filter((route) => route.startsWith("/make/")).sort(),
    [...hrefs, "/make/texture"].sort(),
  );
  assert.deepEqual(PRESET_LABS, slugs);
  assert.deepEqual(Object.keys(PRESET_LAB_NAMES), slugs);
  for (const lab of ALL_LABS) {
    assert.equal(PRESET_LAB_NAMES[lab.slug], lab.name);
    for (const file of [
      "page.tsx",
      "opengraph-image.png",
      "opengraph-image.alt.txt",
    ]) {
      assert.ok(
        existsSync(`src/app${lab.href}/${file}`),
        `${lab.href}/${file}`,
      );
    }
    assert.ok(existsSync(`public${lab.image}`), lab.image);
  }
  const readmeLabs = [
    ...read("README.md").matchAll(
      /^\| \[[^\]]+\]\(https:\/\/garageholds\.com\/make\/([^/)]+)\)/gm,
    ),
  ].map(([, slug]) => slug);
  assert.deepEqual(readmeLabs, listedSlugs);
});

test("analytics events accept exactly the registered lab slugs", () => {
  type LabEvent = Extract<Parameters<typeof trackEvent>[0], { lab: unknown }>;
  type KeysMatch = {
    [Event in LabEvent as Event["name"]]: [Event["lab"]] extends [LabSlug]
      ? [LabSlug] extends [Event["lab"]]
        ? true
        : false
      : false;
  }[LabEvent["name"]];
  assert.equal(true satisfies [KeysMatch] extends [true] ? true : false, true);
});

test("account presets agree with the latest lab_presets check constraint", () => {
  const dir = "supabase/migrations";
  const migrations = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const checks = migrations.flatMap((file) => [
    ...read(`${dir}/${file}`).matchAll(
      /(?:constraint\s+lab_presets_lab\s+check\s*\(lab in\s*\()([^)]*)/gi,
    ),
  ]);
  const latest = checks.at(-1);
  assert.ok(latest, "missing lab_presets_lab constraint");
  const allowed = [...latest[1].matchAll(/'([^']+)'/g)].map(([, slug]) => slug);
  assert.deepEqual(allowed.sort(), [...PRESET_LABS].sort());
});

test("generator configuration and required files agree with LABS", () => {
  assert.deepEqual(Object.keys(LAB_KINDS), generatorSlugs);
  assert.deepEqual(
    Object.entries(KIND_LABELS),
    generators.map(({ slug, label }) => [slug, label]),
  );
  assert.equal(
    new Set(generators.map(({ port }) => port)).size,
    generators.length,
  );
  const functions = Object.keys(JSON.parse(read("vercel.json")).functions);
  assert.deepEqual(
    functions
      .filter(
        (path) => !["api/preview_mesh.py", "api/jug_force.py"].includes(path),
      )
      .sort(),
    generatorSlugs.map((slug) => `api/${slug}.py`).sort(),
  );
  const localUrls = [
    ...read(".env.example").matchAll(/^# ([A-Z]+_API_URL)=([^\r\n]+)/gm),
  ]
    .filter(([, key]) => key !== "PREVIEW_API_URL")
    .map(([, key, url]) => [key, url]);
  assert.deepEqual(
    localUrls,
    generators.map(({ slug, port }) => [
      `${slug.toUpperCase()}_API_URL`,
      `http://127.0.0.1:${port}`,
    ]),
  );
  for (const { slug, tool } of generators) {
    assert.ok(existsSync(`api/${slug}.py`), `api/${slug}.py`);
    assert.ok(
      existsSync(`tools/${tool}/serve_api.py`),
      `tools/${tool}/serve_api.py`,
    );
    assert.ok(existsSync(`tools/${tool}/tests`), `tools/${tool}/tests`);
  }
  for (const [file, extraTools] of [
    ["ci.yml", ["custom-shape-generator", "jug-force-lab", "mesh-preview"]],
    ["deep-tests.yml", ["mesh-preview"]],
  ] as const) {
    const workflow = read(`.github/workflows/${file}`);
    const matrix = workflow.match(/^ +tool:\r?\n((?: +-[^\r\n]+\r?\n)+)/m);
    assert.ok(matrix, `${file} tool matrix`);
    const tools = [...matrix[1].matchAll(/^ +- (\S+)/gm)].map(
      ([, tool]) => tool,
    );
    assert.deepEqual(
      tools.sort(),
      [...generators.map(({ tool }) => tool), ...extraTools].sort(),
      file,
    );
    assert.ok(
      workflow.includes(
        "python -m unittest discover -s tools/${{ matrix.tool }}/tests",
      ),
      file,
    );
  }
  const fixture = JSON.parse(read("tests/fixtures/lab-defaults.json"));
  assert.deepEqual(Object.keys(fixture).sort(), [...generatorSlugs].sort());
});

test("Next rewrites every configured lab generator", async () => {
  const original = process.env;
  try {
    process.env = {
      NODE_ENV: original.NODE_ENV,
      ...Object.fromEntries(
        generatorSlugs.map((slug) => [
          `${slug.toUpperCase()}_API_URL`,
          "http://127.0.0.1:9999/",
        ]),
      ),
    };
    assert.deepEqual(
      await nextConfig.rewrites?.(),
      generatorSlugs.map((slug) => ({
        source: `/api/${slug}`,
        destination: `http://127.0.0.1:9999/api/${slug}`,
      })),
    );
  } finally {
    process.env = original;
  }
});
