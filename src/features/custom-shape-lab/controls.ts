import hardware from "../../../tools/hold_hardware.json";
import type { ShapeParameters } from "./mask";

// The screw every lab drills, shared with the generators (RIL-116).
function hardwareControl(key: string) {
  const control = hardware.controls.find((item) => item.key === key);
  if (!control) throw new Error(`tools/hold_hardware.json has no ${key}.`);
  return control;
}
export const SCREW_HOLE = hardwareControl("shank_diameter");
export const SCREW_HEAD = hardwareControl("head_diameter");

export const DEFAULT_PARAMETERS: ShapeParameters = {
  scale: 200,
  depth: 30,
  bodyTaper: 0,
  incut: 0,
  gripAllSides: false,
  gripDepth: 0,
  lipRadius: 10,
  bodyRounding: 4,
  shankDiameter: hardware.defaults.shank_diameter,
  headDiameter: hardware.defaults.head_diameter,
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
    shankDiameter: {
      min: SCREW_HOLE.min,
      max: Math.min(SCREW_HOLE.max, p.headDiameter - hardware.head_over_shank),
    },
    headDiameter: {
      min: Math.max(SCREW_HEAD.min, p.shankDiameter + hardware.head_over_shank),
      max: Math.min(SCREW_HEAD.max, p.depth - 2),
    },
    seatDepth: { min: 2, max: Math.max(2, p.depth - p.headDiameter) },
  };
}
export function normalizeParameters(
  p: ShapeParameters,
  bodyHeight = p.scale,
): ShapeParameters {
  const depth = Math.max(16, Math.min(70, p.depth));
  const headDiameter = Math.max(
    p.shankDiameter + hardware.head_over_shank,
    Math.min(SCREW_HEAD.max, depth - 2, p.headDiameter),
  );
  const next = { ...p, depth, headDiameter };
  const ranges = controlRanges(next, next.scale, bodyHeight);
  for (const key of Object.keys(ranges) as (keyof typeof ranges)[])
    next[key] = Math.max(ranges[key].min, Math.min(ranges[key].max, next[key]));
  if (next.autoSeat) next.seatDepth = Math.min(12, ranges.seatDepth.max);
  return next;
}
