import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ConeGeometry,
  SphereGeometry,
  Euler,
  Vector3,
  Matrix4,
  type BufferGeometry,
} from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { prepareStlGeometry } from "../src/features/holds/stl-geometry";
import { holdGeometry } from "../src/features/holds/stl-scene";
import {
  getStlViewFrame,
  getStlViewDirection,
  fitStlCamera,
} from "../src/features/holds/stl-orientation";
import { STL_VIEWS } from "../src/features/holds/stl-views";
import {
  MAX_STL_PREVIEW_BYTES,
  MAX_STL_PREVIEW_TRIANGLES,
} from "../src/features/holds/stl-limits";

function fixture(name: string): ArrayBuffer {
  const file = readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
  return file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength,
  ) as ArrayBuffer;
}

function normalize(geometry: BufferGeometry) {
  geometry.center();
  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere!.radius;
  geometry.scale(1 / radius, 1 / radius, 1 / radius);
  return geometry;
}

test("preview cameras find a flat mounting face on rotated and reversed meshes without changing geometry", () => {
  // An asymmetric footprint with a single broad mounting face and curved sides.
  for (const rotation of [
    new Euler(),
    new Euler(0.8, -0.7, 0.3),
    new Euler(Math.PI, 0, 0),
  ]) {
    const geometry = new ConeGeometry(2, 0.8, 48).toNonIndexed();
    geometry.rotateX(Math.PI / 2);
    geometry.scale(1.7, 0.7, 1);
    geometry.applyMatrix4(new Matrix4().makeRotationFromEuler(rotation));
    normalize(geometry);
    try {
      const original = geometry.getAttribute("position").array.slice();
      const frame = getStlViewFrame(geometry);
      const expectedUp = new Vector3(0, 0, 1).applyEuler(rotation);
      assert.ok(
        frame.up.dot(expectedUp) > 0.99,
        "mounting face should point into the hold",
      );
      assert.ok(
        Math.abs(frame.across.dot(new Vector3(1, 0, 0).applyEuler(rotation))) >
          0.98,
        "side cameras should follow the longer footprint axis",
      );
      for (const option of STL_VIEWS) {
        const direction = getStlViewDirection(frame, option.id);
        assert.ok(direction.toArray().every(Number.isFinite));
        assert.ok(Math.abs(direction.length() - 1) < 1e-6);
        assert.ok(direction.dot(frame.up) > 0);
        if (option.id !== "overview")
          assert.ok(
            direction.dot(frame.up) < 0.2,
            "edge views must be close to the mounting plane",
          );
      }
      const side = getStlViewDirection(frame, "side")
        .projectOnPlane(frame.up)
        .normalize();
      const opposite = getStlViewDirection(frame, "other-side")
        .projectOnPlane(frame.up)
        .normalize();
      const end = getStlViewDirection(frame, "end")
        .projectOnPlane(frame.up)
        .normalize();
      assert.ok(side.dot(opposite) < -0.99);
      assert.ok(Math.abs(side.dot(end)) < 0.01);
      assert.deepEqual(geometry.getAttribute("position").array, original);
      const positions = geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i += 3) {
        const b = new Vector3().fromBufferAttribute(positions, i + 1);
        const c = new Vector3().fromBufferAttribute(positions, i + 2);
        positions.setXYZ(i + 1, c.x, c.y, c.z);
        positions.setXYZ(i + 2, b.x, b.y, b.z);
      }
      assert.ok(
        getStlViewFrame(geometry).up.dot(expectedUp) > 0.99,
        "reversed winding must not flip the mounting face",
      );
    } finally {
      geometry.dispose();
    }
  }
});

test("curved models without a broad flat face keep a stable Z-up fallback", () => {
  const geometry = normalize(new SphereGeometry(1, 48, 24).toNonIndexed());
  try {
    const frame = getStlViewFrame(geometry);
    assert.ok(frame.up.equals(new Vector3(0, 0, 1)));
    assert.ok(Math.abs(frame.up.dot(frame.across)) < 1e-6);
    assert.ok(Math.abs(frame.up.dot(frame.depth)) < 1e-6);
  } finally {
    geometry.dispose();
  }
});

test("each camera fits off-center silhouettes without clipping or shrinking side profiles", () => {
  const geometry = prepareStlGeometry(fixture("preview-shape.stl"));
  try {
    geometry.translate(0.2, -0.1, 0.15);
    const frame = getStlViewFrame(geometry);
    const point = new Vector3();
    for (const option of STL_VIEWS) {
      const direction = getStlViewDirection(frame, option.id);
      const { target, halfHeight } = fitStlCamera(
        geometry,
        direction,
        frame.up,
      );
      const right = new Vector3().crossVectors(direction, frame.up).normalize();
      const vertical = new Vector3().crossVectors(right, direction).normalize();
      const positions = geometry.getAttribute("position");
      let fill = 0;
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).sub(target);
        const x = Math.abs(point.dot(right)) / ((halfHeight * 4) / 3);
        const y = Math.abs(point.dot(vertical)) / halfHeight;
        assert.ok(x < 1 && y < 1, `${option.id} must contain every vertex`);
        fill = Math.max(fill, x, y);
      }
      assert.ok(fill > 0.8, `${option.id} should fill most of the frame`);
    }
  } finally {
    geometry.dispose();
  }
});

test("ASCII and binary STLs produce a visible centered geometry without altering the original bytes", () => {
  for (const name of ["qa-model.stl", "preview-shape.stl"]) {
    const data = fixture(name);
    const original = Buffer.from(data).toString("base64");
    const geometry = prepareStlGeometry(data);
    try {
      assert.ok(geometry.getAttribute("position").count >= 3);
      geometry.computeBoundingSphere();
      assert.ok(Math.abs(geometry.boundingSphere!.radius - 1) < 0.001);
      assert.ok(geometry.boundingSphere!.center.length() < 0.001);
      assert.equal(Buffer.from(data).toString("base64"), original);
    } finally {
      geometry.dispose();
    }
  }
});

test("invalid, non-finite, and invisible geometry is rejected", () => {
  assert.throws(() =>
    prepareStlGeometry(new TextEncoder().encode("not an STL").buffer),
  );
  const data = fixture("preview-shape.stl");
  new DataView(data).setFloat32(96, Infinity, true);
  assert.throws(() => prepareStlGeometry(data), /invalid coordinates/);
  const empty = new ArrayBuffer(84 + 50);
  new DataView(empty).setUint32(80, 1, true);
  assert.throws(() => prepareStlGeometry(empty), /no visible shape/);
});

test("oversized and overly detailed STLs are rejected without changing upload support", () => {
  assert.throws(
    () => prepareStlGeometry(new ArrayBuffer(MAX_STL_PREVIEW_BYTES + 1)),
    /too large/,
  );
  const data = new ArrayBuffer(84 + (MAX_STL_PREVIEW_TRIANGLES + 1) * 50);
  new DataView(data).setUint32(80, MAX_STL_PREVIEW_TRIANGLES + 1, true);
  assert.throws(() => prepareStlGeometry(data), /too detailed/);
});

test("the viewer stands an STL on its mounting face at the file's own size", () => {
  const data = fixture("preview-shape.stl");
  const original = Buffer.from(data).toString("base64");
  const reference = new STLLoader().parse(data);
  reference.computeBoundingSphere();
  const geometry = holdGeometry(data);
  try {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    // Same size as the file, flat back on Z=0, centred across and up.
    assert.ok(
      Math.abs(
        geometry.boundingSphere!.radius - reference.boundingSphere!.radius,
      ) < 1e-3,
    );
    assert.ok(Math.abs(box.min.z) < 1e-6);
    assert.ok(Math.abs(box.min.x + box.max.x) < 1e-6);
    assert.ok(Math.abs(box.min.y + box.max.y) < 1e-6);
    assert.ok(box.max.x - box.min.x >= box.max.y - box.min.y);
    // The mounting face is the broad flat face on Z=0: most of the
    // downward-facing area lies there.
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    let down = 0;
    let onBack = 0;
    for (let i = 0; i < positions.count; i += 3) {
      if (normals.getZ(i) > -0.99) continue;
      down++;
      if (positions.getZ(i) < 1e-3) onBack++;
    }
    assert.ok(down > 0 && onBack / down > 0.9);
    assert.equal(Buffer.from(data).toString("base64"), original);
  } finally {
    geometry.dispose();
    reference.dispose();
  }
});
