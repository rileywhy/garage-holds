import assert from "node:assert/strict";
import test from "node:test";
import {
  paintProfile,
  smoothPaintStroke,
} from "../src/features/custom-shape-lab/profile-paint";
import {
  cloneCut,
  newCut,
  profileStroke,
  profileMillimeterStroke,
  smoothProfile,
} from "../src/features/custom-shape-lab/cut-profiles";
import {
  cloneDocument,
  emptyDocument,
  serializeDocument,
  stroke,
} from "../src/features/custom-shape-lab/mask";
import { smoothStroke } from "../src/features/custom-shape-lab/smoothing";
import { profileViewport } from "../src/features/custom-shape-lab/profile-viewport";

test("side view uses equal millimeter scales and pointer coordinates match circular brushes", () => {
  for (const [min, max, depth] of [
    [-2, 200, 30],
    [0, 40, 70],
    [-10, 100, 16],
  ]) {
    const viewport = profileViewport(min, max, depth);
    assert(
      Math.abs(
        viewport.x(min + 6) - viewport.x(min) - (viewport.y(0) - viewport.y(6)),
      ) < 1e-9,
    );
    const point = viewport.point(
      viewport.x((min + max) / 2),
      viewport.y(depth / 2),
    );
    assert(Math.abs(point[0] - (min + max) / 2) < 1e-9);
    assert(Math.abs(point[1] - depth / 2) < 1e-9);
    assert(viewport.left >= 38 && viewport.top >= 38 - 1e-9);
    assert.deepEqual(viewport.point(-100, 1000), [min, 0]);
  }
});

test("profiles and history are separate from base drawing and copied deeply", () => {
  const doc = emptyDocument();
  stroke(doc, [80, 80], [180, 80], 30, false);
  doc.cuts.push(newCut("test"));
  const original = doc.material.slice(),
    snapshot = cloneDocument(doc);
  doc.cuts[0].profile = profileStroke(
    doc.cuts[0].profile,
    [0.3, 0.2],
    [0.8, 0.7],
    false,
  );
  assert(doc.cuts[0].profile.some((v) => v > 0));
  assert(snapshot.cuts[0].profile.every((v) => v === 0));
  assert.deepEqual(doc.material, original);
  assert.equal(serializeDocument(doc).cuts.length, 1);
  const erased = profileStroke(doc.cuts[0].profile, [0, 0.2], [0, 0.7], true);
  assert(
    erased.reduce((a, b) => a + b, 0) <
      doc.cuts[0].profile.reduce((a, b) => a + b, 0),
  );
});

test("profile smoothing removes sharp spikes without exceeding depth bounds", () => {
  const profile = Array(33).fill(0);
  profile[16] = 1;
  const smooth = smoothProfile(profile);
  assert(smooth[16] < 1 && smooth[15] > 0);
  assert(smooth.every((v) => v >= 0 && v <= 1));
  assert.equal(profile[16], 1);
});

test("painted cut brushes affect bounded areas and can reach zero", () => {
  const initial = newCut("paint");
  const first = paintProfile(initial, [2, 0], [2, 0], 6, false, -2, 100, 30);
  const second = paintProfile(first, [2, 20], [2, 20], 6, false, -2, 100, 30);
  const material = second.paint!.material,
    size = second.paint!.size;
  assert.equal(size, 256);
  assert(material.slice((size - 1) * size).some(Boolean));
  assert(
    material
      .slice((size * size) / 2, (size * size) / 2 + size)
      .every((v) => v === 0),
  );
  assert.equal(initial.paint, undefined);
  const erased = paintProfile(second, [2, 20], [2, 20], 10, true, -2, 100, 30);
  assert(
    erased.paint!.material.reduce((a, b) => a + b, 0) <
      material.reduce((a, b) => a + b, 0),
  );
});

test("editing older paint masks upgrades their resolution without losing distant cuts", () => {
  const cut = newCut("legacy");
  const material = Array(128 ** 2).fill(0);
  material[20 * 128 + 100] = 1;
  cut.paint = { size: 128, min: 0, max: 100, material };
  const edited = paintProfile(cut, [5, 0], [5, 2], 2, false, 0, 100, 30);
  assert.equal(edited.paint!.size, 256);
  assert.equal(edited.paint!.material[40 * 256 + 200], 1);
  assert.equal(edited.paint!.material[41 * 256 + 201], 1);
  assert.equal(cut.paint.size, 128);
});

test("cut strokes can start outside every part edge and preserve existing paint when the workspace expands", () => {
  const viewport = profileViewport(-12, 112, 30, -12, 42);
  for (const [x, z] of [
    [-8, -6],
    [108, 36],
  ]) {
    const point = viewport.point(viewport.x(x), viewport.y(z));
    assert(Math.abs(point[0] - x) < 1e-9);
    assert(Math.abs(point[1] - z) < 1e-9);
  }
  let cut = paintProfile(
    newCut("outside"),
    [-4, -4],
    [4, 4],
    8,
    false,
    -12,
    112,
    30,
    -12,
    42,
  );
  cut = paintProfile(cut, [104, 34], [96, 26], 8, false, -12, 112, 30, -12, 42);
  const paint = cut.paint!;
  const at = (x: number, z: number) =>
    paint.material[
      Math.floor(
        ((paint.top! - z) / (paint.top! - paint.bottom!)) * paint.size,
      ) *
        paint.size +
        Math.floor(((x - paint.min) / (paint.max - paint.min)) * paint.size)
    ];
  assert.equal(at(-4, -4), 1);
  assert.equal(at(104, 34), 1);
  assert.equal(at(50, 15), 0);
  const expanded = paintProfile(
    cut,
    [-18, 15],
    [-18, 15],
    4,
    false,
    -24,
    124,
    30,
    -24,
    54,
  );
  const p = expanded.paint!;
  const row = Math.floor(((p.top! + 4) / (p.top! - p.bottom!)) * p.size);
  const col = Math.floor(((-4 - p.min) / (p.max - p.min)) * p.size);
  assert.equal(p.material[row * p.size + col], 1);
  assert.equal(paint.min, -12);
});

test("whole-side profiles are default and millimeter strokes expand depth without moving existing edits", () => {
  const cut = newCut("whole");
  assert.equal(cut.fullSide, true);
  assert.equal(cut.blendEnds, false);
  assert.equal(cut.blendRims, false);
  cut.profile[16] = 0.5;
  const deeper = profileMillimeterStroke(cut, [80, 0.2], [80, 0.25], false);
  assert.equal(deeper.depth, 80);
  assert.equal(deeper.profile[16] * deeper.depth, 3);
  assert(deeper.profile.some((v) => v * deeper.depth === 80));
});

test("local smoothing removes unsupported bumps and fills gaps, leaving distant pixels and holes intact", () => {
  const doc = emptyDocument();
  for (let y = 100; y <= 140; y++)
    for (let x = 100; x <= 140; x++) doc.material[y * 256 + x] = 1;
  doc.material[99 * 256 + 120] = 1;
  doc.material[120 * 256 + 120] = 0;
  doc.material[20 * 256 + 20] = 1;
  doc.holes.push({ id: "hole", x: 130, y: 130 });
  const before = doc.material.slice();
  smoothStroke(doc, [120, 100], [120, 120], 25, 1);
  assert.equal(doc.material[99 * 256 + 120], 0);
  assert.equal(doc.material[120 * 256 + 120], 1);
  assert.equal(doc.material[20 * 256 + 20], 1);
  assert.deepEqual(doc.holes, [{ id: "hole", x: 130, y: 130 }]);
  assert.notDeepEqual(before, doc.material);
});

test("shape smoothing visibly softens multi-pixel bumps and notches, with adjustable strength", () => {
  const doc = emptyDocument();
  for (let y = 100; y <= 200; y++)
    for (let x = 60; x <= 190; x++) doc.material[y * 256 + x] = 1;
  for (let y = 94; y < 100; y++)
    for (let x = 110; x < 120; x++) doc.material[y * 256 + x] = 1;
  for (let y = 100; y < 106; y++)
    for (let x = 140; x < 150; x++) doc.material[y * 256 + x] = 0;
  const weak = cloneDocument(doc),
    strong = cloneDocument(doc);
  smoothStroke(weak, [130, 100], [130, 100], 60, 0.1);
  smoothStroke(strong, [130, 100], [130, 100], 60, 1);
  const changed = (target: typeof doc) =>
    target.material.reduce(
      (sum, value, i) => sum + Number(value !== doc.material[i]),
      0,
    );
  assert(changed(strong) > changed(weak) + 30);
  assert.equal(strong.material[95 * 256 + 115], 0);
  assert.equal(strong.material[104 * 256 + 145], 1);
  assert.equal(strong.material[190 * 256 + 65], 1);
});

test("cut smoothing uses a local circular brush in millimeters on stretched masks", () => {
  const cut = newCut("smooth");
  const size = 256,
    min = -20,
    max = 180,
    bottom = -10,
    top = 50;
  cut.paint = {
    size,
    min,
    max,
    bottom,
    top,
    material: Array.from({ length: size ** 2 }, (_, i) => {
      const x = min + (((i % size) + 0.5) / size) * (max - min);
      const z = top - ((Math.floor(i / size) + 0.5) / size) * (top - bottom);
      return Number(
        (x >= 40 &&
          x <= 120 &&
          z >= 10 &&
          z <= 30 &&
          !(x >= 90 && x <= 93 && z >= 28)) ||
          (x >= 70 && x <= 73 && z >= 30 && z <= 32),
      );
    }),
  };
  const before = [...cut.paint.material];
  const result = smoothPaintStroke(cut, [65, 30], [100, 30], 20, 1, 30);
  assert.deepEqual(cut.paint.material, before);
  const at = (x: number, z: number) =>
    result.paint!.material[
      Math.floor(((top - z) / (top - bottom)) * size) * size +
        Math.floor(((x - min) / (max - min)) * size)
    ];
  assert.equal(at(71, 31), 0);
  assert.equal(at(91, 28.5), 1);
  assert.notDeepEqual(result.paint!.material, before);
  for (let i = 0; i < before.length; i++) {
    const x = min + (((i % size) + 0.5) / size) * (max - min);
    const z = top - ((Math.floor(i / size) + 0.5) / size) * (top - bottom);
    const nearest = Math.max(65, Math.min(100, x));
    if ((x - nearest) ** 2 + (z - 30) ** 2 > 100)
      assert.equal(result.paint!.material[i], before[i]);
  }
  assert.equal(
    smoothPaintStroke(newCut("empty"), [0, 0], [0, 0], 20, 1, 30).paint,
    undefined,
  );
});

test("repeated smoothing preserves narrow painted cuts even with a larger brush", () => {
  let cut = paintProfile(
    newCut("narrow"),
    [1, 15],
    [1, 15],
    6,
    false,
    -12,
    112,
    30,
    -12,
    42,
  );
  const count = cut.paint!.material.reduce((a, b) => a + b, 0);
  assert(count > 0);
  for (let step = 0; step < 30; step++) {
    cut = smoothPaintStroke(
      cut,
      [1, 15],
      [1 + Math.sin(step) * 2, 15],
      20,
      1,
      30,
    );
    assert.equal(
      cut.paint!.material.reduce((a, b) => a + b, 0),
      count,
    );
  }
});

test("old partial blended cuts become through cuts for preview, history, and export", () => {
  const old = {
    ...newCut("legacy"),
    fullSide: false,
    blendEnds: true,
    blendRims: true,
    insideRadius: 8,
    outsideRadius: 3,
  };
  const doc = emptyDocument();
  doc.cuts = [old];
  for (const cut of [
    cloneCut(old),
    cloneDocument(doc).cuts[0],
    serializeDocument(doc).cuts[0],
  ]) {
    assert.equal(cut.fullSide, true);
    assert.equal(cut.blendEnds, false);
    assert.equal(cut.blendRims, false);
    assert.equal(cut.insideRadius, 0);
    assert.equal(cut.outsideRadius, 0);
  }
  assert.equal(old.fullSide, false);
});
