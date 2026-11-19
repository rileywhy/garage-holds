import {
  BufferGeometry,
  Float32BufferAttribute,
  type BufferAttribute,
} from "three";
import { type HeightMap, sampleHeight } from "./height-map";

export interface ReliefSettings {
  tileMm: number;
  depthMm: number;
  direction: 1 | -1;
  baseline: 0 | 1;
}

const TRIANGLE_BUDGET = 500_000;

// Split every edge at its midpoint. Each shared edge gets the same samples,
// so displacement cannot open cracks where the original triangles meet.
export function refineSurface(source: BufferGeometry, edgeMm = 1.6) {
  const positions = source.getAttribute("position");
  const indices = source.getIndex();
  const count = indices?.count ?? positions.count;
  const point = (i: number) => {
    const vertex = indices?.getX(i) ?? i;
    return [
      positions.getX(vertex),
      positions.getY(vertex),
      positions.getZ(vertex),
    ];
  };
  let longest = 0;
  for (let i = 0; i < count; i += 3) {
    const a = point(i),
      b = point(i + 1),
      c = point(i + 2);
    longest = Math.max(longest, edge(a, b), edge(b, c), edge(c, a));
  }
  let levels = 0;
  while (
    longest > edgeMm &&
    (count / 3) * 4 ** (levels + 1) <= TRIANGLE_BUDGET
  ) {
    longest /= 2;
    levels++;
  }
  const vertices = new Float32Array(count * 4 ** levels * 3);
  let offset = 0;
  function split(a: number[], b: number[], c: number[], remaining: number) {
    if (!remaining) {
      vertices.set(a, offset);
      vertices.set(b, offset + 3);
      vertices.set(c, offset + 6);
      offset += 9;
      return;
    }
    const ab = midpoint(a, b),
      bc = midpoint(b, c),
      ca = midpoint(c, a);
    split(a, ab, ca, remaining - 1);
    split(ab, b, bc, remaining - 1);
    split(ca, bc, c, remaining - 1);
    split(ab, bc, ca, remaining - 1);
  }
  for (let i = 0; i < count; i += 3)
    split(point(i), point(i + 1), point(i + 2), levels);
  const surface = new BufferGeometry();
  surface.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  return surface;
}

const edge = (a: number[], b: number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const midpoint = (a: number[], b: number[]) => a.map((v, i) => (v + b[i]) / 2);

// Input is in millimetres, with the back at the lowest Z. Planar projection
// moves Z only and fades from the back, so it also works on triangle soup.
export function displaceSurface(
  surface: BufferGeometry,
  tile: HeightMap,
  settings: ReliefSettings,
) {
  const result = surface.clone();
  result.computeBoundingBox();
  const back = result.boundingBox!.min.z;
  const points = result.getAttribute("position") as BufferAttribute;
  for (let i = 0; i < points.count; i++) {
    const z = points.getZ(i);
    const fade = Math.max(0, Math.min(1, (z - back - 1) / 4));
    if (!fade) continue;
    const height = Math.abs(
      sampleHeight(
        tile,
        points.getX(i) / settings.tileMm,
        -points.getY(i) / settings.tileMm,
      ) - settings.baseline,
    );
    points.setZ(i, z + settings.depthMm * settings.direction * height * fade);
  }
  result.computeVertexNormals();
  result.computeBoundingBox();
  return result;
}
