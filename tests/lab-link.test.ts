import assert from "node:assert/strict";
import test from "node:test";
import {
  linkSearch,
  parseLinkValue,
  readLink,
  replaceSearch,
} from "../src/features/lab-link/lab-link";
import {
  decodeMask,
  encodeMask,
  holesFromLink,
  holesToLink,
} from "../src/features/custom-shape-lab/link";
import { emptyDocument, stroke } from "../src/features/custom-shape-lab/mask";

const defaults = {
  width: 48,
  incut: 30,
  screws: true,
  auto_seat: true,
  shape: "edge",
  seed: 0,
};
const presets = {
  "board edge": { ...defaults },
  ball: { ...defaults, shape: "ball", width: 36, incut: 0 },
};

test("a link carries only the settings that differ from the defaults", () => {
  assert.equal(linkSearch(defaults, defaults, presets), "");
  assert.equal(
    linkSearch(
      { ...defaults, width: 60, screws: false, incut: 30.00000001 },
      defaults,
      presets,
    ),
    "?width=60&screws=false",
  );
  assert.equal(
    linkSearch({ ...defaults, width: 19.9599999999 }, defaults),
    "?width=19.96",
  );
});

test("values the generator derives while an auto switch is on stay out of the link", () => {
  const auto = {
    auto_spacing: true,
    screw_spacing: 0,
    auto_seat: true,
    seat_depth: 6,
  };
  assert.equal(
    linkSearch({ ...auto, screw_spacing: 30, seat_depth: 9.5 }, auto),
    "",
  );
  assert.equal(
    linkSearch({ ...auto, auto_spacing: false, screw_spacing: 30 }, auto),
    "?auto_spacing=false&screw_spacing=30",
  );
});

test("settings that match a preset exactly link to the preset by name", () => {
  assert.equal(
    linkSearch(
      { ...defaults, shape: "ball", width: 36, incut: 0 },
      defaults,
      presets,
    ),
    "?preset=ball",
  );
  assert.deepEqual(readLink("?preset=ball", defaults, presets), {
    parameters: presets.ball,
    preset: "ball",
  });
  // Explicit values win over the preset they start from.
  assert.deepEqual(
    readLink("?preset=ball&width=40", defaults, presets)?.parameters,
    { ...presets.ball, width: 40 },
  );
});

test("a link round-trips, and unknown or mangled values are ignored", () => {
  const edited = { ...defaults, width: 52.5, auto_seat: false, shape: "rock" };
  const back = readLink(linkSearch(edited, defaults), defaults);
  assert.deepEqual(back, { parameters: edited, preset: null });
  assert.equal(readLink("", defaults), null);
  assert.equal(readLink("?utm_source=reddit&nothing=1", defaults), null);
  assert.deepEqual(
    readLink("?width=abc&incut=&screws=maybe&seed=7", defaults)?.parameters,
    { ...defaults, seed: 7 },
  );
  assert.equal(readLink("?preset=unknown", defaults, presets), null);
});

test("link values are typed like the default they replace", () => {
  assert.equal(parseLinkValue("1", true), true);
  assert.equal(parseLinkValue("0", false), false);
  assert.equal(parseLinkValue("yes", true), null);
  assert.equal(parseLinkValue("12.5", 1), 12.5);
  assert.equal(parseLinkValue("Infinity", 1), null);
  assert.equal(parseLinkValue("dish", "edge"), "dish");
  assert.equal(parseLinkValue("x".repeat(41), "edge"), null);
});

test("a painted mask survives the link and stays short for a simple shape", async () => {
  const doc = emptyDocument();
  stroke(doc, [64, 140], [192, 140], 100, false);
  const encoded = await encodeMask(doc.material);
  assert.ok(encoded.length < 1500, `mask link is ${encoded.length} chars`);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  const decoded = await decodeMask(encoded, doc.material.length);
  assert.ok(decoded);
  assert.deepEqual(Array.from(decoded), Array.from(doc.material));
  assert.equal(await decodeMask("not*base64", doc.material.length), null);
  assert.equal(await decodeMask(encoded, 64), null);
});

test("mounting holes travel as canvas coordinates", () => {
  const text = holesToLink([
    { id: "a", x: 85.123, y: 140 },
    { id: "b", x: 171, y: 140.06 },
  ]);
  assert.equal(text, "85.1,140;171,140.1");
  assert.deepEqual(
    holesFromLink(`${text};999,1;x,y`, 256).map(({ x, y }) => [x, y]),
    [
      [85.1, 140],
      [171, 140.1],
    ],
  );
});

test("the address is only rewritten while the lab's own page is showing", () => {
  const writes: string[] = [];
  const fake = {
    location: { pathname: "/make/jug", search: "", hash: "" },
    history: {
      state: null,
      replaceState: (_state: unknown, _title: string, url: string) =>
        writes.push(url),
    },
  };
  (globalThis as { window?: unknown }).window = fake;
  try {
    replaceSearch("?edge_depth=30", "/make/crimp");
    assert.deepEqual(writes, [], "a crimp preview must not touch the jug page");
    replaceSearch("?grip_quality=40", "/make/jug");
    assert.deepEqual(writes, ["/make/jug?grip_quality=40"]);
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});
