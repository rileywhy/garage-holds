// Both painting and a future importer produce this same semantic document.
import { cloneCut, type CutProfile } from "./cut-profiles";
export const ARTWORK_COLORS = {
  material: "#007BFF",
  hole: "#FF0000",
  background: "#FFFFFF",
} as const;
export const RESOLUTION = 256;
export interface MountingHole {
  id: string;
  x: number;
  y: number;
}
export interface MaskDocument {
  version: 1;
  size: number;
  material: Uint8Array;
  holes: MountingHole[];
  cuts: CutProfile[];
}
export interface ShapeParameters {
  scale: number;
  depth: number;
  bodyTaper: number;
  incut: number;
  gripAllSides: boolean;
  gripDepth: number;
  lipRadius: number;
  bodyRounding: number;
  shankDiameter: number;
  headDiameter: number;
  seatDepth: number;
  autoSeat: boolean;
}
export function emptyDocument(): MaskDocument {
  return {
    version: 1,
    size: RESOLUTION,
    material: new Uint8Array(RESOLUTION ** 2),
    holes: [],
    cuts: [],
  };
}
export function cloneDocument(doc: MaskDocument): MaskDocument {
  return {
    ...doc,
    material: doc.material.slice(),
    holes: doc.holes.map((h) => ({ ...h })),
    cuts: doc.cuts.map(cloneCut),
  };
}

export function materialHeight(doc: MaskDocument, scale: number) {
  let low = doc.size;
  let high = -1;
  for (let i = 0; i < doc.material.length; i++) {
    if (!doc.material[i]) continue;
    const y = Math.floor(i / doc.size);
    low = Math.min(low, y);
    high = Math.max(high, y);
  }
  return high < low ? 0 : ((high - low + 1) * scale) / doc.size;
}
export function edgeDepthLimit(
  doc: MaskDocument,
  scale: number,
  incut: number,
  depth: number,
  headDiameter: number,
) {
  let top = doc.size;
  for (let i = 0; i < doc.material.length; i++)
    if (doc.material[i]) top = Math.min(top, Math.floor(i / doc.size));
  if (top === doc.size) return 0;
  const holes = doc.holes.map((hole) => hole.y);
  const lowestHole = holes.length ? Math.min(...holes) : doc.size;
  const canvasClearance = ((headDiameter / 2 + 2) * doc.size) / scale;
  const holeLimit = holes.length
    ? lowestHole - top - canvasClearance
    : doc.size - top;
  const incutAllowance =
    (Math.abs(Math.tan((incut * Math.PI) / 180)) * Math.max(0, depth - 6)) / 2;
  return Math.max(
    0,
    Math.min(depth * 0.95, ((holeLimit - incutAllowance) * scale) / doc.size),
  );
}
export function stroke(
  doc: MaskDocument,
  from: [number, number],
  to: [number, number],
  diameter: number,
  erase: boolean,
) {
  const [ax, ay] = from,
    [bx, by] = to;
  const radius = diameter / 2,
    length = (bx - ax) ** 2 + (by - ay) ** 2;
  for (
    let y = Math.max(0, Math.floor(Math.min(ay, by) - radius));
    y <= Math.min(doc.size - 1, Math.ceil(Math.max(ay, by) + radius));
    y++
  ) {
    for (
      let x = Math.max(0, Math.floor(Math.min(ax, bx) - radius));
      x <= Math.min(doc.size - 1, Math.ceil(Math.max(ax, bx) + radius));
      x++
    ) {
      const t = length
        ? Math.max(
            0,
            Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / length),
          )
        : 0;
      if (
        (x - ax - t * (bx - ax)) ** 2 + (y - ay - t * (by - ay)) ** 2 <=
        radius ** 2
      )
        doc.material[y * doc.size + x] = erase ? 0 : 1;
    }
  }
}
export function exampleDocument(): MaskDocument {
  const doc = emptyDocument();
  stroke(doc, [64, 140], [192, 140], 100, false);
  doc.holes = [
    { id: "left", x: 85, y: 140 },
    { id: "right", x: 171, y: 140 },
  ];
  return doc;
}
export function holeFits(
  doc: MaskDocument,
  x: number,
  y: number,
  scale: number,
  exclude?: string,
  headDiameter = 11,
) {
  const radius = ((headDiameter / 2 + 3.5) * doc.size) / scale;
  for (let yy = Math.floor(y - radius); yy <= Math.ceil(y + radius); yy++)
    for (let xx = Math.floor(x - radius); xx <= Math.ceil(x + radius); xx++) {
      if (
        (xx - x) ** 2 + (yy - y) ** 2 <= radius ** 2 &&
        (xx < 0 ||
          yy < 0 ||
          xx >= doc.size ||
          yy >= doc.size ||
          !doc.material[yy * doc.size + xx])
      )
        return false;
    }
  return doc.holes.every(
    (h) =>
      h.id === exclude ||
      (Math.hypot(h.x - x, h.y - y) * scale) / doc.size >= headDiameter + 4,
  );
}
export function serializeDocument(doc: MaskDocument) {
  return {
    version: doc.version,
    size: doc.size,
    material: Array.from(doc.material),
    holes: doc.holes,
    cuts: doc.cuts.map(cloneCut),
  };
}
