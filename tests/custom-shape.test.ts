import assert from "node:assert/strict";
import test from "node:test";
import { drawingContours } from "../src/features/custom-shape-lab/drawing-preview";
import {
  DEFAULT_PARAMETERS,
  controlRanges,
  normalizeParameters,
} from "../src/features/custom-shape-lab/controls";
import {
  emptyDocument,
  stroke,
  cloneDocument,
  holeFits,
  serializeDocument,
} from "../src/features/custom-shape-lab/mask";
test("fast diagonal strokes have continuous solid material and erasing keeps semantic holes", () => {
  const doc = emptyDocument();
  stroke(doc, [20, 20], [200, 200], 20, false);
  for (let i = 20; i <= 200; i++) assert.equal(doc.material[i * 256 + i], 1);
  doc.holes.push({ id: "one", x: 100, y: 100 });
  const before = cloneDocument(doc);
  stroke(doc, [100, 100], [100, 100], 30, true);
  assert.equal(doc.material[100 * 256 + 100], 0);
  assert.equal(before.material[100 * 256 + 100], 1);
  assert.equal(doc.holes.length, 1);
  assert.equal(serializeDocument(doc).material.length, 256 ** 2);
});
test("hole edge and neighbor clearance respects physical scale", () => {
  const doc = emptyDocument();
  stroke(doc, [128, 128], [128, 128], 100, false);
  assert(holeFits(doc, 128, 128, 200));
  assert(!holeFits(doc, 175, 128, 200));
  doc.holes.push({ id: "one", x: 128, y: 128 });
  assert(!holeFits(doc, 130, 128, 200));
});

test("body taper defaults to zero and its angle limit follows body dimensions", () => {
  assert.equal(DEFAULT_PARAMETERS.bodyTaper, 0);
  const short = controlRanges(DEFAULT_PARAMETERS, 100, 80).bodyTaper.max;
  const tall = controlRanges(DEFAULT_PARAMETERS, 100, 160).bodyTaper.max;
  assert(short > tall);
  assert.equal(
    normalizeParameters({ ...DEFAULT_PARAMETERS, bodyTaper: 60 }, 160)
      .bodyTaper,
    tall,
  );
  assert.equal(
    controlRanges({ ...DEFAULT_PARAMETERS, depth: 16 }, 100, 160).bodyTaper
      .max < tall,
    true,
  );
});

test("smoothed display contours preserve erased openings and the drawing mask", () => {
  const doc = emptyDocument();
  stroke(doc, [128, 128], [128, 128], 100, false);
  stroke(doc, [128, 128], [128, 128], 30, true);
  const before = doc.material.slice();
  const contours = drawingContours(doc);
  assert.equal(contours.length, 2);
  assert(
    contours.some((ring) =>
      ring.some(([x, y]) => !Number.isInteger(x) || !Number.isInteger(y)),
    ),
  );
  assert.deepEqual(doc.material, before);
  const area = (ring: [number, number][]) =>
    ring.reduce((sum, p, i) => {
      const next = ring[(i + 1) % ring.length];
      return sum + p[0] * next[1] - p[1] * next[0];
    }, 0) / 2;
  assert(area(contours[0]) * area(contours[1]) < 0);
});
