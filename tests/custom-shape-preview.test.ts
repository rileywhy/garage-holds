import assert from "node:assert/strict";
import test from "node:test";
import {
  decodePreview,
  previewMesh,
} from "../src/features/custom-shape-lab/preview";

function triangle() {
  const buffer = new ArrayBuffer(24 + 12 * (3 + 1));
  const header = new DataView(buffer);
  header.setUint32(0, 3, true);
  header.setUint32(4, 1, true);
  header.setFloat64(8, 25.5, true);
  header.setFloat64(16, 12, true);
  new Float32Array(buffer, 24, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  new Uint32Array(buffer, 60, 3).set([0, 1, 2]);
  return buffer;
}

test("binary preview decodes positions, faces and metadata without copying", () => {
  const buffer = triangle();
  const data = decodePreview(buffer);
  assert.equal(data.positions.buffer, buffer);
  assert.equal(data.indices.buffer, buffer);
  assert.deepEqual([...data.indices], [0, 1, 2]);
  assert.equal(data.volume_cm3, 25.5);
  assert.equal(data.seatDepth, 12);
  const geometry = previewMesh(data);
  assert.equal(geometry.getAttribute("position").count, 3);
  assert.equal(geometry.getAttribute("normal").getZ(0), 1);
  geometry.dispose();
});

test("truncated binary previews are rejected before creating geometry", () => {
  assert.throws(() => decodePreview(new ArrayBuffer(8)), /Incomplete/);
  assert.throws(() => decodePreview(triangle().slice(0, 60)), /Invalid/);
});

test("smooth preview shading does not change when a surface has more thin triangles", () => {
  for (const divisions of [1, 24]) {
    const positions = [0, 0, 0];
    for (let i = 0; i <= divisions; i++) {
      const angle = ((i / divisions) * Math.PI) / 2;
      positions.push(Math.cos(angle), Math.sin(angle), 0);
    }
    positions.push(-Math.cos(Math.PI / 6), 0, Math.sin(Math.PI / 6));
    const indices = [];
    for (let i = 0; i < divisions; i++) indices.push(0, i + 1, i + 2);
    indices.push(0, divisions + 1, divisions + 2);
    const geometry = previewMesh({
      positions: new Float32Array(positions),
      indices: new Uint32Array(indices),
      volume_cm3: 1,
      seatDepth: 1,
    });
    const normal = geometry.getAttribute("normal");
    assert(Math.abs(normal.getX(0) - Math.sin(Math.PI / 12)) < 1e-5);
    assert(Math.abs(normal.getZ(0) - Math.cos(Math.PI / 12)) < 1e-5);
    geometry.dispose();
  }
});

test("preview shading keeps a square mounting corner crisp", () => {
  const geometry = previewMesh({
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 3, 1]),
    volume_cm3: 1,
    seatDepth: 1,
  });
  const normals = geometry.getAttribute("normal");
  assert.equal(normals.getZ(0), 1);
  assert.equal(normals.getY(3), 1);
  geometry.dispose();
});
