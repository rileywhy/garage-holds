import assert from "node:assert/strict";
import test from "node:test";
import {
  texturePngFilename,
  texturedStlFilename,
} from "../src/features/textures/export-name";
import { BufferGeometry, Float32BufferAttribute } from "three";
import {
  makeHeightMap,
  sampleHeight,
} from "../src/features/textures/height-map";
import {
  displaceSurface,
  refineSurface,
} from "../src/features/textures/displacement";
import {
  createPaintMask,
  paintSegment,
  sampleCoverage,
} from "../src/features/textures/paint-mask";
import {
  ROCK_PATTERNS,
  makeRockSampler,
} from "../src/features/textures/rock-patterns";

test("texture exports identify the hold and recipe with portable filenames", () => {
  assert.equal(
    texturedStlFilename({
      hold: "Crête / nº 2: FINAL.STL",
      pattern: "granite-crystals",
      tileMm: 60,
      depthMm: 1.25,
      reverse: true,
      painted: true,
      seed: 73,
    }),
    "crete-no-2-final--granite-crystals--tile60mm-depth1.25mm-reversed-painted-seed73.stl",
  );
  assert.equal(
    texturePngFilename({
      pattern: "granite-crystals",
      seed: 73,
      density: 3,
      contrast: 1.25,
      detail: 0.5,
    }),
    "granite-crystals--seed73-density3-contrast1.25-grain0.5.png",
  );
});

test("rock presets are distinct, seeded and continuous across tile seams", () => {
  const maps = new Set<string>();
  for (const pattern of Object.keys(
    ROCK_PATTERNS,
  ) as (keyof typeof ROCK_PATTERNS)[]) {
    const recipe = { pattern, seed: 73, density: 5 };
    const tile = makeHeightMap(recipe, 64);
    assert.deepEqual(tile, makeHeightMap(recipe, 64));
    assert.notDeepEqual(tile, makeHeightMap({ ...recipe, detail: 0 }, 64));
    maps.add(Buffer.from(tile.pixels).toString("base64"));
    const height = makeRockSampler(pattern, 73, 5, 0.5);
    assert.ok(Math.abs(height(0, 0.37) - height(1, 0.37)) < 1e-9);
    assert.ok(Math.abs(height(0.42, 0) - height(0.42, 1)) < 1e-9);
  }
  assert.equal(maps.size, Object.keys(ROCK_PATTERNS).length);
});

test("a fast stroke paints a continuous path with feathered edges and can be erased", () => {
  const mask = createPaintMask({ x: -20, y: -20 }, { x: 20, y: 20 }, false);
  const start = { x: -10, y: 0 },
    end = { x: 10, y: 0 };
  paintSegment(mask, start, end, { radius: 7, softness: 0.7, erase: false });
  assert.equal(sampleCoverage(mask, 0, 0), 1);
  const feather = sampleCoverage(mask, 0, 5);
  assert.ok(feather > 0 && feather < 1);
  assert.equal(sampleCoverage(mask, 0, 9), 0);
  paintSegment(mask, start, end, { radius: 3, softness: 0.4, erase: true });
  assert.equal(sampleCoverage(mask, 0, 0), 0);
  assert.equal(sampleCoverage(mask, 0, 5), feather);
});

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
