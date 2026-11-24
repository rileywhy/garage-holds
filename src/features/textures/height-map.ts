import { clamp01, makeRockSampler, ROCK_PATTERNS } from "./rock-patterns";

export const PATTERNS = {
  ...ROCK_PATTERNS,
  "sweeping-strata": "Sweeping Strata",
  strata: "Broken Strata",
  flecks: "Scattered Flecks",
  shoals: "Shoals",
  sandstone: "Sandstone",
  dimples: "Dimples",
} as const;

export type TexturePattern = keyof typeof PATTERNS;

export interface TextureRecipe {
  pattern: TexturePattern;
  seed: number;
  density: number;
  detail?: number;
  contrast?: number;
}

export interface HeightMap {
  size: number;
  pixels: Uint8Array;
}

const TAU = Math.PI * 2;
const wrap = (n: number) => n - Math.floor(n);

// The same periodic height field feeds the PNG and the displaced mesh.
export function makeHeightMap(
  { pattern, seed, density, detail = 0.5, contrast = 1 }: TextureRecipe,
  size = 1024,
): HeightMap {
  if (Object.hasOwn(ROCK_PATTERNS, pattern)) {
    const sample = makeRockSampler(
      pattern as keyof typeof ROCK_PATTERNS,
      seed,
      density,
      detail,
    );
    const pixels = new Uint8Array(size * size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        pixels[y * size + x] = Math.round(
          255 * clamp01(0.5 + contrast * (sample(x / size, y / size) - 0.5)),
        );
    return { size, pixels };
  }
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const marks = Array.from({ length: density }, (_, index) => ({
    x: random(),
    y:
      pattern === "sweeping-strata"
        ? (index + random() * 0.7) / density
        : random(),
    span: 0.85 + random() * 0.13,
    rise: 0.25 + random() * 0.15,
    arc: 0.1 + random() * 0.09,
    phase: random() * 0.8,
    width: 0.011 + random() * 0.009,
    height: 0.35 + random() * 0.2,
  }));
  const shapes = {
    strata: [0.1, 0.015],
    flecks: [0.033, 0.022],
    shoals: [0.085, 0.048],
    dimples: [0.065, 0.065],
  } as const;
  const accents =
    pattern in shapes
      ? marks.flatMap((mark) => {
          const [length, width] = shapes[pattern as keyof typeof shapes];
          const heading = random() * TAU;
          return Array.from({ length: 3 }, () => {
            const angle = heading + (random() - 0.5) * 0.75;
            return {
              x: mark.x + (random() - 0.5) * 0.19,
              y: mark.y + (random() - 0.5) * 0.1,
              cos: Math.cos(angle),
              sin: Math.sin(angle),
              length: length * (0.7 + random() * 0.6),
              width: width * (0.7 + random() * 0.6),
              height: mark.height,
            };
          });
        })
      : [];
  const pixels = new Uint8Array(size * size);
  for (let column = 0; column < size; column++) {
    const x = column / size;
    const sweeps =
      pattern === "sweeping-strata"
        ? marks.flatMap((mark) => {
            const t = wrap(x - mark.x) / mark.span;
            if (t >= 1) return [];
            const taper = Math.sin(Math.PI * t);
            return [
              {
                center:
                  mark.y +
                  mark.rise * t +
                  mark.arc * Math.sin(TAU * 0.8 * t + mark.phase),
                width: mark.width * (0.18 + 0.82 * taper),
                height: mark.height * taper ** 0.65,
              },
            ];
          })
        : [];
    for (let row = 0; row < size; row++) {
      const y = row / size;
      let height = 0;
      for (const stroke of sweeps) {
        const distance = y - stroke.center - Math.round(y - stroke.center);
        height = Math.max(
          height,
          stroke.height * Math.max(0, 1 - (distance / stroke.width) ** 2) ** 2,
        );
      }
      for (const mark of accents) {
        const dx = x - mark.x - Math.round(x - mark.x);
        const dy = y - mark.y - Math.round(y - mark.y);
        const u = (dx * mark.cos + dy * mark.sin) / mark.length;
        const v = (dy * mark.cos - dx * mark.sin) / mark.width;
        height = Math.max(
          height,
          mark.height * Math.max(0, 1 - u * u - v * v) ** 2,
        );
      }
      if (pattern === "sandstone") {
        const bend = 0.45 * Math.sin(TAU * x + marks[0].phase);
        height =
          0.8 * ((1 + Math.cos(TAU * (density * y + x + bend))) / 2) ** 1.5;
      }
      const relief = clamp01(height * contrast);
      pixels[row * size + column] = Math.round(
        255 * (pattern === "dimples" ? 1 - relief : relief),
      );
    }
  }
  return { size, pixels };
}

// Bilinear sampling crosses the tile edge in both directions.
export function sampleHeight(
  { size, pixels }: HeightMap,
  u: number,
  v: number,
) {
  const x = wrap(u) * size,
    y = wrap(v) * size;
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const nx = (ix + 1) % size,
    ny = (iy + 1) % size;
  // A tiny negative input can round to exactly 1 after wrapping.
  const column = ix % size;
  const row = iy % size;
  const a =
    pixels[row * size + column] * (1 - (x - ix)) +
    pixels[row * size + nx] * (x - ix);
  const b =
    pixels[ny * size + column] * (1 - (x - ix)) +
    pixels[ny * size + nx] * (x - ix);
  return (a * (1 - (y - iy)) + b * (y - iy)) / 255;
}

export interface SeamlessTurn {
  degrees: number;
  // Tiles of the unrotated pattern spanned by one edge of the rotated PNG.
  repeats: number;
  cos: number;
  sin: number;
}

const MAX_REPEATS_SQUARED = 25;
const TURNS: SeamlessTurn[] = [];
// Visit the smallest repeat for each angle first, e.g. (1, 0) before (2, 0).
for (let squared = 1; squared <= MAX_REPEATS_SQUARED; squared++)
  for (let a = -5; a <= 5; a++)
    for (let b = -5; b <= 5; b++) {
      if (a * a + b * b !== squared) continue;
      const repeats = Math.sqrt(squared);
      const degrees = (Math.atan2(b, a) * 180) / Math.PI;
      if (TURNS.some((turn) => Math.abs(turn.degrees - degrees) < 1e-9))
        continue;
      TURNS.push({ degrees, repeats, cos: a / repeats, sin: b / repeats });
    }

// A square PNG only tiles after rotation when its edges land on whole tiles
// of the original pattern, so the angle snaps to the nearest such direction.
export function seamlessTurn(degrees: number): SeamlessTurn {
  const gap = (turn: SeamlessTurn) =>
    Math.abs(((((turn.degrees - degrees) % 360) + 540) % 360) - 180);
  return TURNS.reduce((best, turn) =>
    gap(turn) < gap(best) - 1e-9 ? turn : best,
  );
}

export function rotateHeightMap(
  map: HeightMap,
  { repeats, cos, sin }: SeamlessTurn,
  size = repeats === 1 ? map.size : 2 * map.size,
): HeightMap {
  if (repeats === 1 && cos === 1) return map;
  const pixels = new Uint8Array(size * size);
  for (let row = 0; row < size; row++)
    for (let column = 0; column < size; column++) {
      // Sample pixel corners so a quarter turn is an exact permutation.
      const x = (column / size) * repeats,
        y = (row / size) * repeats;
      pixels[row * size + column] = Math.round(
        255 * sampleHeight(map, x * cos - y * sin, x * sin + y * cos),
      );
    }
  return { size, pixels };
}
