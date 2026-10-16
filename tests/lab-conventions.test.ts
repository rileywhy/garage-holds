import assert from "node:assert/strict";
import test from "node:test";
import {
  labFilename,
  meshExtents,
  withInches,
} from "../src/features/labs/conventions";

test("export filenames carry the lab and the hold's size", () => {
  assert.equal(
    labFilename("crimp", [120.4, 39.6, 28], "stl"),
    "crimp-120x40x28mm.stl",
  );
  assert.equal(
    labFilename("foot", [60, 30, 22.5], "json"),
    "foot-60x30x23mm.json",
  );
});

test("sizes read in millimetres and inches", () => {
  assert.equal(
    withInches([127, 25.4, 50.8]),
    "127 × 25.4 × 50.8 mm · 5.00 × 1.00 × 2.00 in",
  );
});

test("mesh extents are the bounding box on each axis", () => {
  assert.deepEqual(
    meshExtents([
      [0, 0, 0],
      [10, -2, 3],
      [-5, 4, 1],
    ]),
    [15, 6, 3],
  );
  assert.deepEqual(meshExtents([]), [0, 0, 0]);
});
