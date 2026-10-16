import { BufferAttribute, BufferGeometry } from "three";

export function smoothPreviewGeometry(
  data: { positions: Float32Array; indices: Uint32Array },
  creaseAngle = Math.PI / 3,
) {
  const indexed = new BufferGeometry();
  indexed.setAttribute("position", new BufferAttribute(data.positions, 3));
  indexed.setIndex(new BufferAttribute(data.indices, 1));
  const geometry = indexed.toNonIndexed();
  // Weight normals by the angle at each corner, not the number of incident
  // triangles. Thin boolean triangles otherwise produce mottled, faceted
  // shading on an already smooth surface. Keep real creases sharp.
  const faces = data.indices.length / 3;
  const faceNormals = new Float32Array(faces * 3);
  const angles = new Float32Array(data.indices.length);
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
    }
  }
  // Join corners only across shared, smooth edges. Every triangle in the
  // same surface fan then gets the identical vertex normal. Comparing each
  // face to its neighbours independently can leave stripes on curved rims.
  const parents = Int32Array.from(data.indices, (_, i) => i);
  function root(corner: number): number {
    while (parents[corner] !== corner) {
      parents[corner] = parents[parents[corner]];
      corner = parents[corner];
    }
    return corner;
  }
  function join(a: number, b: number) {
    parents[root(a)] = root(b);
  }
  // Boolean meshes can repeat a position under distinct vertex indices.
  // Match those seams for lighting only; leave all original coordinates intact.
  const vertexIds = new Int32Array(data.positions.length / 3);
  const positions = new Map<string, number>();
  for (let i = 0; i < vertexIds.length; i++) {
    const key = [0, 1, 2]
      .map((axis) => Math.round(data.positions[i * 3 + axis] * 1e5))
      .join(":");
    let id = positions.get(key);
    if (id === undefined) {
      id = positions.size;
      positions.set(key, id);
    }
    vertexIds[i] = id;
  }
  const edges = new Map<string, [number, number]>();
  const creaseDot = Math.cos(creaseAngle) - 1e-6;
  for (let face = 0; face < faces; face++) {
    const base = face * 3;
    for (let k = 0; k < 3; k++) {
      const a = base + k,
        b = base + ((k + 1) % 3);
      const va = vertexIds[data.indices[a]],
        vb = vertexIds[data.indices[b]];
      const key = va < vb ? `${va}:${vb}` : `${vb}:${va}`;
      const other = edges.get(key);
      if (!other) {
        edges.set(key, [a, b]);
        continue;
      }
      const otherFace = Math.floor(other[0] / 3) * 3;
      const dot =
        faceNormals[base] * faceNormals[otherFace] +
        faceNormals[base + 1] * faceNormals[otherFace + 1] +
        faceNormals[base + 2] * faceNormals[otherFace + 2];
      if (dot < creaseDot) continue;
      if (vertexIds[data.indices[other[0]]] === va) {
        join(a, other[0]);
        join(b, other[1]);
      } else {
        join(a, other[1]);
        join(b, other[0]);
      }
    }
  }
  const sums = new Float64Array(data.indices.length * 3);
  for (let corner = 0; corner < data.indices.length; corner++) {
    const group = root(corner) * 3,
      face = Math.floor(corner / 3) * 3;
    for (let axis = 0; axis < 3; axis++)
      sums[group + axis] += faceNormals[face + axis] * angles[corner];
  }
  const normals = new Float32Array(data.indices.length * 3);
  for (let corner = 0; corner < data.indices.length; corner++) {
    const group = root(corner) * 3;
    const length =
      Math.hypot(sums[group], sums[group + 1], sums[group + 2]) || 1;
    normals.set(
      [
        sums[group] / length,
        sums[group + 1] / length,
        sums[group + 2] / length,
      ],
      corner * 3,
    );
  }
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  indexed.dispose();
  return geometry;
}
