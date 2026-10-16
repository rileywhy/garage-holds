export const PROFILE_SAMPLES = 33;
export type CutEdge = "top" | "right" | "bottom" | "left";
export interface CutProfile {
  id: string;
  name: string;
  enabled: boolean;
  edge: CutEdge;
  position: number;
  anchor: [number, number] | null;
  width: number;
  depth: number;
  heightOffset?: number;
  edgeSmoothing?: number | null;
  blendEnds?: boolean;
  blendRims?: boolean;
  insideRadius?: number;
  outsideRadius?: number;
  fullSide?: boolean;
  viewBased?: boolean;
  paint?: {
    size: number;
    material: number[];
    min: number;
    max: number;
    bottom?: number;
    top?: number;
  };
  profile: number[];
}
export function newCut(id: string): CutProfile {
  return {
    id,
    name: "New cut",
    enabled: true,
    edge: "top",
    position: 0.5,
    anchor: null,
    width: 0.12,
    depth: 6,
    blendEnds: false,
    blendRims: false,
    insideRadius: 0,
    outsideRadius: 0,
    fullSide: true,
    viewBased: true,
    profile: Array(PROFILE_SAMPLES).fill(0),
  };
}
export function cloneCut(cut: CutProfile): CutProfile {
  return {
    ...cut,
    fullSide: true,
    blendEnds: false,
    blendRims: false,
    insideRadius: 0,
    outsideRadius: 0,
    anchor: cut.anchor ? [...cut.anchor] : null,
    profile: [...cut.profile],
    paint: cut.paint
      ? { ...cut.paint, material: [...cut.paint.material] }
      : undefined,
  };
}
export function smoothProfile(profile: number[]) {
  return profile.map(
    (value, i) =>
      value * 0.5 +
      profile[Math.max(0, i - 1)] * 0.25 +
      profile[Math.min(profile.length - 1, i + 1)] * 0.25,
  );
}
export function profileMillimeterStroke(
  cut: CutProfile,
  from: [number, number],
  to: [number, number],
  erase: boolean,
): CutProfile {
  const depth = Math.max(cut.depth, from[0], to[0]);
  const profile = cut.profile.map((v) => (v * cut.depth) / depth);
  return {
    ...cut,
    depth,
    profile: profileStroke(
      profile,
      [from[0] / depth, from[1]],
      [to[0] / depth, to[1]],
      erase,
    ),
  };
}
export function profileStroke(
  profile: number[],
  from: [number, number],
  to: [number, number],
  erase: boolean,
) {
  const next = [...profile];
  const steps = Math.max(
    1,
    Math.ceil(Math.abs(to[1] - from[1]) * PROFILE_SAMPLES * 2),
  );
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const y = (from[1] + (to[1] - from[1]) * t) * (PROFILE_SAMPLES - 1);
    const x = Math.max(0, Math.min(1, from[0] + (to[0] - from[0]) * t));
    for (
      let i = Math.max(0, Math.round(y) - 1);
      i <= Math.min(PROFILE_SAMPLES - 1, Math.round(y) + 1);
      i++
    )
      next[i] = erase ? 0 : x;
  }
  return next;
}
