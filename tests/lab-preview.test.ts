import assert from "node:assert/strict";
import test from "node:test";
import { previewGeometry } from "../src/features/labs/preview-geometry";

test("a rounded return keeps its back face out of the curved surface normals", () => {
  // The return meets the back at 45°, inside the usual 60° smoothing threshold.
  // These two faces must stay visually distinct even at that shallow angle.
  const vertices = [
    [0, 0, 0],
    [10, 0, 0],
    [0, 10, 0],
    [0, -10, 10],
  ];
  const geometry = previewGeometry(
    {
      vertices,
      faces: [
        [0, 1, 3],
        [0, 2, 1],
      ],
    },
    true,
  );
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const originNormals = [];
  for (let i = 0; i < positions.count; i++) {
    if (
      positions.getX(i) === 0 &&
      positions.getY(i) === 0 &&
      positions.getZ(i) === 0
    ) {
      originNormals.push([normals.getX(i), normals.getY(i), normals.getZ(i)]);
    }
  }
  assert.equal(positions.count, 6);
  assert.equal(originNormals.length, 2);
  assert.ok(
    originNormals.some(
      ([, y, z]) =>
        Math.abs(y + Math.SQRT1_2) < 1e-6 && Math.abs(z + Math.SQRT1_2) < 1e-6,
    ),
  );
  assert.ok(originNormals.some(([x, y, z]) => x === 0 && y === 0 && z === -1));
  geometry.dispose();
});

test("screw-seat rims stay sharp at a 45-degree change in surface", () => {
  const geometry = previewGeometry({
    vertices: [
      [0, 0, 0],
      [10, 0, 0],
      [0, 10, 0],
      [0, -10, 10],
    ],
    faces: [
      [0, 1, 3],
      [0, 2, 1],
    ],
  });
  const normals = geometry.getAttribute("normal");
  assert.ok(Math.abs(normals.getY(0) + Math.SQRT1_2) < 1e-6);
  assert.ok(Math.abs(normals.getZ(0) + Math.SQRT1_2) < 1e-6);
  assert.equal(normals.getY(3), 0);
  assert.equal(normals.getZ(3), -1);
  geometry.dispose();
});

test("splitting a boolean triangle does not wrinkle smooth shading", () => {
  const vertices = [
    [0, 0, 0],
    [10, 0, 0],
    [0, 10, 0],
    [-10, 0, 2],
    [5, 5, 0],
  ];
  const original = previewGeometry({
    vertices,
    faces: [
      [0, 1, 2],
      [0, 2, 3],
    ],
  });
  const split = previewGeometry({
    vertices,
    faces: [
      [0, 1, 4],
      [0, 4, 2],
      [0, 2, 3],
    ],
  });
  const a = original.getAttribute("normal"),
    b = split.getAttribute("normal");
  for (const get of ["getX", "getY", "getZ"] as const)
    assert.ok(Math.abs(a[get](0) - b[get](0)) < 1e-6);
  assert.ok(a.getX(0) > 0, "the gentle curve is smoothed across triangles");
  assert.deepEqual(
    Array.from(original.getAttribute("position").array),
    [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 0, 0, 10, 0, -10, 0, 2],
  );
  original.dispose();
  split.dispose();
});

test("duplicated boolean vertices share smooth lighting without moving the mesh", () => {
  const vertices = [
    [0, 0, 0],
    [10, 0, 0],
    [0, 10, 0],
    [0, 0, 0],
    [0, 10, 0],
    [-10, 0, 2],
  ];
  const geometry = previewGeometry({
    vertices,
    faces: [
      [0, 1, 2],
      [3, 4, 5],
    ],
  });
  const normals = geometry.getAttribute("normal");
  assert.ok(normals.getX(0) > 0);
  for (const get of ["getX", "getY", "getZ"] as const)
    assert.ok(Math.abs(normals[get](0) - normals[get](3)) < 1e-6);
  assert.deepEqual(
    Array.from(geometry.getAttribute("position").array),
    vertices.flat(),
  );
  geometry.dispose();
});
