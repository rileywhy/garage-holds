import assert from "node:assert/strict";
import test from "node:test";
import { previewGeometry } from "../src/features/crimp-lab/preview-geometry";

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
