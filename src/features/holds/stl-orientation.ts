import { Vector3, type BufferGeometry } from "three";
import type { StlView } from "./stl-views";

type Plane = { normal: Vector3; offset: number; area: number };

// Find a broad, flat outer face as a likely mounting surface. Normals come from
// vertex winding rather than the STL's supplied normals, which can be unreliable.
// This only chooses cameras; geometry and original files are never rotated.
export function getStlViewFrame(geometry: BufferGeometry) {
  const positions = geometry.getAttribute("position");
  const planes = new Map<string, Plane>();
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  const ab = new Vector3(),
    ac = new Vector3(),
    normal = new Vector3();
  let totalArea = 0;
  let largestTriangle: Plane | undefined;
  for (let i = 0; i + 2 < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i);
    b.fromBufferAttribute(positions, i + 1);
    c.fromBufferAttribute(positions, i + 2);
    normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    const area = normal.length() / 2;
    if (area < 1e-10) continue;
    totalArea += area;
    normal.normalize();
    // Treat reversed winding and parallel opposing faces consistently.
    const components = [normal.x, normal.y, normal.z];
    const dominant = components.reduce(
      (best, value, index) =>
        Math.abs(value) > Math.abs(components[best]) ? index : best,
      0,
    );
    if (components[dominant] < 0) normal.negate();
    const offset = normal.dot(a);
    if (!largestTriangle || area > largestTriangle.area) {
      largestTriangle = { normal: normal.clone(), offset, area };
    }
    // Geometry is already normalized to a unit sphere. Small buckets tolerate
    // floating-point noise; the cap bounds work/memory for irregular meshes.
    const key = [normal.x, normal.y, normal.z, offset]
      .map((value) => Math.round(value * 100))
      .join(",");
    const plane = planes.get(key);
    if (plane) {
      plane.normal.addScaledVector(normal, area);
      plane.offset += offset * area;
      plane.area += area;
    } else if (planes.size < 8192) {
      planes.set(key, {
        normal: normal.clone().multiplyScalar(area),
        offset: offset * area,
        area,
      });
    }
  }
  const candidates = [...planes.values()]
    .sort((a, b) => b.area - a.area)
    .slice(0, 8)
    .map((plane) => ({
      normal: plane.normal.normalize(),
      offset: plane.offset / plane.area,
      area: plane.area,
    }));
  if (largestTriangle) candidates.push(largestTriangle);
  let up = new Vector3(0, 0, 1);
  for (const plane of candidates) {
    if (plane.area < totalArea * 0.05) continue;
    let min = Infinity,
      max = -Infinity;
    for (let i = 0; i < positions.count; i++) {
      const projection = a.fromBufferAttribute(positions, i).dot(plane.normal);
      min = Math.min(min, projection);
      max = Math.max(max, projection);
    }
    if (max - min < 0.02) continue;
    if (Math.abs(plane.offset - min) < 0.01) {
      up = plane.normal.clone();
      break;
    }
    if (Math.abs(plane.offset - max) < 0.01) {
      up = plane.normal.clone().negate();
      break;
    }
  }

  // Align side views with the longer direction of the hold's footprint. Use
  // bounded sampling here; exact alignment isn't needed to expose the profile.
  const across = new Vector3(
    Math.abs(up.x) < 0.9 ? 1 : 0,
    Math.abs(up.x) < 0.9 ? 0 : 1,
    0,
  );
  across.addScaledVector(up, -across.dot(up)).normalize();
  const depth = new Vector3().crossVectors(up, across).normalize();
  let xx = 0,
    yy = 0,
    xy = 0,
    xSum = 0,
    ySum = 0,
    count = 0;
  const stride = Math.max(1, Math.ceil(positions.count / 20000));
  for (let i = 0; i < positions.count; i += stride) {
    a.fromBufferAttribute(positions, i);
    const x = a.dot(across),
      y = a.dot(depth);
    xx += x * x;
    yy += y * y;
    xy += x * y;
    xSum += x;
    ySum += y;
    count++;
  }
  xx -= (xSum * xSum) / count;
  yy -= (ySum * ySum) / count;
  xy -= (xSum * ySum) / count;
  if (Math.hypot(xx - yy, 2 * xy) > (xx + yy) * 0.1) {
    const angle = Math.atan2(2 * xy, xx - yy) / 2;
    across
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(depth, Math.sin(angle))
      .normalize();
    depth.crossVectors(up, across).normalize();
  }
  return { up, across, depth };
}

export function getStlViewDirection(
  frame: ReturnType<typeof getStlViewFrame>,
  view: StlView,
) {
  const directions: Record<StlView, [number, number, number]> = {
    side: [1, 0.25, 0.14],
    "other-side": [-1, -0.25, 0.14],
    end: [-0.25, 1, 0.14],
    "other-end": [0.25, -1, 0.14],
    overview: [1.6, -2.3, 1.8],
  };
  const [x, y, z] = directions[view];
  return frame.across
    .clone()
    .multiplyScalar(x)
    .addScaledVector(frame.depth, y)
    .addScaledVector(frame.up, z)
    .normalize();
}

// Fit the visible silhouette, not the whole bounding sphere: narrow side
// profiles should fill the frame just as well as broad front/overview views.
export function fitStlCamera(
  geometry: BufferGeometry,
  direction: Vector3,
  up: Vector3,
  aspect = 4 / 3,
) {
  const right = new Vector3().crossVectors(direction, up).normalize();
  const vertical = new Vector3().crossVectors(right, direction).normalize();
  const positions = geometry.getAttribute("position");
  const point = new Vector3();
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i);
    const x = point.dot(right),
      y = point.dot(vertical);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const target = right
    .clone()
    .multiplyScalar((minX + maxX) / 2)
    .addScaledVector(vertical, (minY + maxY) / 2);
  const halfHeight =
    Math.max((maxY - minY) / 2, (maxX - minX) / (2 * aspect), 1e-4) * 1.18;
  return { target, halfHeight };
}
