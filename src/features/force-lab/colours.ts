import * as THREE from "three";

// Share of strength used: calm at rest, amber past half, red at the limit,
// dark red beyond it.
const RAMP: [number, THREE.Color][] = [
  [0, new THREE.Color("#5b7bb8")],
  [0.35, new THREE.Color("#4fa59a")],
  [0.6, new THREE.Color("#e0b341")],
  [0.85, new THREE.Color("#e07a33")],
  [1, new THREE.Color("#c8313f")],
];
const OVER = new THREE.Color("#7d0f2a");

export function ramp(t: number, out = new THREE.Color()) {
  if (!(t >= 0)) t = 0;
  if (t > 1) return out.copy(OVER);
  for (let i = 1; i < RAMP.length; i++) {
    const [t1, c1] = RAMP[i];
    if (t <= t1) {
      const [t0, c0] = RAMP[i - 1];
      return out.copy(c0).lerp(c1, (t - t0) / (t1 - t0));
    }
  }
  return out.copy(RAMP[RAMP.length - 1][1]);
}

// Stress across the layers: pushed together, unloaded (the site's hold
// colour), pulled apart.
const COMPRESSION = new THREE.Color("#5b6fc4");
export const HOLD_COLOUR = new THREE.Color("#c9b9a5");
const TENSION = new THREE.Color("#d0442f");

export function diverging(t: number, out = new THREE.Color()) {
  const v = Math.max(-1, Math.min(1, t || 0));
  return v >= 0
    ? out.copy(HOLD_COLOUR).lerp(TENSION, v)
    : out.copy(HOLD_COLOUR).lerp(COMPRESSION, -v);
}

export const css = (colour: THREE.Color) => `#${colour.getHexString()}`;

export function gradient(fn: (t: number) => THREE.Color, from = 0, to = 1) {
  const stops = Array.from({ length: 13 }, (_, i) => {
    const t = from + ((to - from) * i) / 12;
    return `${css(fn(t))} ${((i / 12) * 100).toFixed(1)}%`;
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

export const TENSION_CSS = css(TENSION);
