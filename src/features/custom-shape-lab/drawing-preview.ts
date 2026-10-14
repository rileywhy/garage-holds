import type { MaskDocument } from "./mask";

// Display-only contours: the binary drawing and exported geometry remain
// independent of canvas resolution. Cache these after each material change.
export function drawingContours(doc: MaskDocument): [number, number][][] {
  const stride = doc.size + 1;
  const edges = new Map<number, number[]>();
  function edge(ax: number, ay: number, bx: number, by: number) {
    const start = ay * stride + ax;
    const ends = edges.get(start) ?? [];
    ends.push(by * stride + bx);
    edges.set(start, ends);
  }
  const filled = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < doc.size &&
    y < doc.size &&
    Boolean(doc.material[y * doc.size + x]);
  for (let y = 0; y < doc.size; y++) {
    for (let x = 0; x < doc.size; x++) {
      if (!filled(x, y)) continue;
      if (!filled(x, y - 1)) edge(x, y, x + 1, y);
      if (!filled(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
      if (!filled(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
      if (!filled(x - 1, y)) edge(x, y + 1, x, y);
    }
  }
  const contours: [number, number][][] = [];
  while (edges.size) {
    const start = edges.keys().next().value!;
    let point = start;
    let ring: [number, number][] = [];
    do {
      ring.push([point % stride, Math.floor(point / stride)]);
      const ends = edges.get(point)!;
      const next = ends.pop()!;
      if (!ends.length) edges.delete(point);
      point = next;
    } while (point !== start);
    for (let pass = 0; pass < 6; pass++) {
      ring = ring.map((p, i) => {
        const before = ring[(i + ring.length - 1) % ring.length];
        const after = ring[(i + 1) % ring.length];
        return [
          p[0] * 0.5 + (before[0] + after[0]) * 0.25,
          p[1] * 0.5 + (before[1] + after[1]) * 0.25,
        ];
      });
    }
    contours.push(ring);
  }
  return contours;
}
