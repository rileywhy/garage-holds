import type { ShapeParameters } from "./mask";

export const DEFAULT_PARAMETERS: ShapeParameters = {
  scale: 200,
  depth: 30,
  bodyTaper: 0,
  incut: 0,
  gripAllSides: false,
  gripDepth: 0,
  lipRadius: 10,
  bodyRounding: 4,
  shankDiameter: 5.5,
  headDiameter: 11,
  seatDepth: 12,
  autoSeat: true,
};
export function controlRanges(
  p: ShapeParameters,
  edgeMax = p.scale,
  bodyHeight = p.scale,
) {
  return {
    scale: { min: 80, max: 300 },
    depth: { min: 16, max: 70 },
    bodyTaper: {
      min: 0,
      max: Math.min(
        60,
        Math.floor(
          ((Math.atan((p.depth - 6) / Math.max(1, bodyHeight)) * 180) /
            Math.PI) *
            10,
        ) / 10,
      ),
    },
    incut: { min: -60, max: 60 },
    gripDepth: { min: 0, max: Math.floor(edgeMax) },
    lipRadius: { min: 1, max: Math.min(20, Math.floor(p.depth - 2)) },
    bodyRounding: { min: 0, max: Math.min(30, Math.floor(p.depth - 2)) },
    shankDiameter: { min: 3, max: Math.min(8, p.headDiameter - 2) },
    headDiameter: { min: p.shankDiameter + 2, max: Math.min(20, p.depth - 2) },
    seatDepth: { min: 2, max: Math.max(2, p.depth - p.headDiameter) },
  };
}
export function normalizeParameters(
  p: ShapeParameters,
  bodyHeight = p.scale,
): ShapeParameters {
  const depth = Math.max(16, Math.min(70, p.depth));
  const headDiameter = Math.max(
    p.shankDiameter + 2,
    Math.min(20, depth - 2, p.headDiameter),
  );
  const next = { ...p, depth, headDiameter };
  const ranges = controlRanges(next, next.scale, bodyHeight);
  for (const key of Object.keys(ranges) as (keyof typeof ranges)[])
    next[key] = Math.max(ranges[key].min, Math.min(ranges[key].max, next[key]));
  if (next.autoSeat) next.seatDepth = Math.min(12, ranges.seatDepth.max);
  return next;
}
