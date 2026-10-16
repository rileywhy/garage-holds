import { BufferAttribute, BufferGeometry } from "three";

// Little-endian header: vertex count, triangle count, volume, seat height.
// Remaining bytes contain float32 positions and uint32 triangle indices.
export function decodePreview(buffer: ArrayBuffer) {
  if (buffer.byteLength < 24) throw new Error("Incomplete preview mesh.");
  const header = new DataView(buffer);
  const vertices = header.getUint32(0, true);
  const triangles = header.getUint32(4, true);
  if (
    !vertices ||
    !triangles ||
    buffer.byteLength !== 24 + (vertices + triangles) * 12
  )
    throw new Error("Invalid preview mesh.");
  return {
    positions: new Float32Array(buffer, 24, vertices * 3),
    indices: new Uint32Array(buffer, 24 + vertices * 12, triangles * 3),
    volume_cm3: header.getFloat64(8, true),
    seatDepth: header.getFloat64(16, true),
  };
}

export function previewMesh(data: ReturnType<typeof decodePreview>) {
  const indexed = new BufferGeometry();
  indexed.setAttribute("position", new BufferAttribute(data.positions, 3));
  indexed.setIndex(new BufferAttribute(data.indices, 1));
  const geometry = indexed.toNonIndexed();
  // Weight normals by the angle at each corner, not the number of incident
  // triangles. Thin boolean triangles otherwise produce mottled, faceted
  // shading on an already smooth surface. Keep real 60-degree creases sharp.
  const faces = data.indices.length / 3;
  const faceNormals = new Float32Array(faces * 3);
  const angles = new Float32Array(data.indices.length);
  const heads = new Int32Array(data.positions.length / 3).fill(-1);
  const next = new Int32Array(data.indices.length);
  for (let face = 0; face < faces; face++) {
    const a = data.indices[face * 3] * 3,
      b = data.indices[face * 3 + 1] * 3,
      c = data.indices[face * 3 + 2] * 3;
    const p = data.positions;
    const ux = p[b] - p[a],
      uy = p[b + 1] - p[a + 1],
      uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a],
      vy = p[c + 1] - p[a + 1],
      vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const area = Math.hypot(nx, ny, nz);
    faceNormals.set(
      [nx / (area || 1), ny / (area || 1), nz / (area || 1)],
      face * 3,
    );
    for (let k = 0; k < 3; k++) {
      const corner = face * 3 + k;
      const vertex = data.indices[corner];
      const origin = vertex * 3,
        u = data.indices[face * 3 + ((k + 1) % 3)] * 3,
        v = data.indices[face * 3 + ((k + 2) % 3)] * 3;
      const dot =
        (p[u] - p[origin]) * (p[v] - p[origin]) +
        (p[u + 1] - p[origin + 1]) * (p[v + 1] - p[origin + 1]) +
        (p[u + 2] - p[origin + 2]) * (p[v + 2] - p[origin + 2]);
      angles[corner] = Math.atan2(area, dot);
      next[corner] = heads[vertex];
      heads[vertex] = corner;
    }
  }
  const normals = new Float32Array(data.indices.length * 3);
  for (let corner = 0; corner < data.indices.length; corner++) {
    const base = Math.floor(corner / 3) * 3;
    let x = 0,
      y = 0,
      z = 0;
    for (
      let adjacent = heads[data.indices[corner]];
      adjacent !== -1;
      adjacent = next[adjacent]
    ) {
      const other = Math.floor(adjacent / 3) * 3;
      const dot =
        faceNormals[base] * faceNormals[other] +
        faceNormals[base + 1] * faceNormals[other + 1] +
        faceNormals[base + 2] * faceNormals[other + 2];
      if (dot < 0.5) continue;
      const weight = angles[adjacent];
      x += faceNormals[other] * weight;
      y += faceNormals[other + 1] * weight;
      z += faceNormals[other + 2] * weight;
    }
    const length = Math.hypot(x, y, z) || 1;
    normals.set([x / length, y / length, z / length], corner * 3);
  }
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  indexed.dispose();
  return geometry;
}
