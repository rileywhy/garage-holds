import test from "node:test";
import assert from "node:assert/strict";
import { centeredBox, normalizeCrop } from "../src/features/uploads/crop";

test("crops are rounded, clamped to the image, and refused when tiny or whole", () => {
  assert.deepEqual(
    normalizeCrop(
      { left: 10.4, top: 20.6, width: 300.2, height: 200 },
      800,
      600,
    ),
    { left: 10, top: 21, width: 300, height: 200 },
  );
  assert.deepEqual(
    normalizeCrop({ left: -5, top: 500, width: 900, height: 400 }, 800, 600),
    { left: 0, top: 500, width: 800, height: 100 },
  );
  assert.equal(
    normalizeCrop({ left: 0, top: 0, width: 800, height: 600 }, 800, 600),
    null,
  );
  assert.equal(
    normalizeCrop({ left: 0, top: 0, width: 40, height: 400 }, 800, 600),
    null,
  );
  assert.equal(
    normalizeCrop({ left: 790, top: 0, width: 100, height: 100 }, 800, 600),
    null,
  );
  assert.equal(
    normalizeCrop({ left: NaN, top: 0, width: 100, height: 100 }, 800, 600),
    null,
  );
});

test("the centred box is the largest of its shape that fits", () => {
  assert.deepEqual(centeredBox(1200, 1600, 4 / 3), {
    left: 0,
    top: 350,
    width: 1200,
    height: 900,
  });
  assert.deepEqual(centeredBox(1600, 600, 4 / 3), {
    left: 400,
    top: 0,
    width: 800,
    height: 600,
  });
});
