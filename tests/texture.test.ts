import assert from "node:assert/strict";
import test from "node:test";
import { BufferGeometry, Float32BufferAttribute } from "three";
import {
  makeHeightMap,
  sampleHeight,
} from "../src/features/textures/height-map";
import {
  displaceSurface,
  refineSurface,
} from "../src/features/textures/displacement";

test("sweeping strata is deterministic, sparse, and samples periodically", () => {
  const recipe = { pattern: "sweeping-strata", density: 2, seed: 73 } as const;
  const tile = makeHeightMap(recipe, 128);
  assert.deepEqual(tile, makeHeightMap(recipe, 128));
  assert.notDeepEqual(tile, makeHeightMap({ ...recipe, seed: 74 }, 128));
  const covered = tile.pixels.reduce(
    (count, value) => count + Number(value > 0),
    0,
  );
  assert.ok(covered > 0 && covered < tile.pixels.length / 10);
  assert.equal(sampleHeight(tile, -1e-18, -1e-18), sampleHeight(tile, 0, 0));
  for (let row = 0; row < 128; row++) {
    assert.equal(
      sampleHeight(tile, -0.125, row / 128),
      sampleHeight(tile, 0.875, row / 128),
    );
  }
});

test("displacement preserves the back and keeps shared edges together", () => {
  const source = new BufferGeometry();
  source.setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0, 8, 4, 0, 8, 0, 4, 8, 4, 0, 8, 4, 4, 8,
        0, 4, 8,
      ],
      3,
    ),
  );
  const surface = refineSurface(source, 4);
  const tile = { size: 2, pixels: new Uint8Array([255, 255, 255, 255]) };
  const result = displaceSurface(surface, tile, {
    depthMm: 0.5,
    tileMm: 20,
    direction: -1,
    baseline: 0,
  });
  const points = result.getAttribute("position");
  const original = surface.getAttribute("position");
  assert.equal(points.count, 36);
  let shared = 0;
  for (let i = 0; i < points.count; i++) {
    assert.equal(points.getZ(i), original.getZ(i) === 0 ? 0 : 7.5);
    if (points.getX(i) === 2 && points.getY(i) === 2 && points.getZ(i) === 7.5)
      shared++;
  }
  assert.ok(shared > 1);
  assert.equal(source.getAttribute("position").getZ(3), 8);
});
