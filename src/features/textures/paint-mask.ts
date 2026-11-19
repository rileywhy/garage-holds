import { clamp01, smooth } from "./rock-patterns";

const SIZE = 384;
type Point = { x: number; y: number };

export interface PaintMask {
  x: number;
  y: number;
  step: number;
  pixels: Uint8Array;
}

export function createPaintMask(
  min: Point,
  max: Point,
  full: boolean,
): PaintMask {
  const span = Math.max(max.x - min.x, max.y - min.y, 1);
  return {
    x: (min.x + max.x - span) / 2,
    y: (min.y + max.y - span) / 2,
    step: span / (SIZE - 1),
    pixels: new Uint8Array(SIZE * SIZE).fill(full ? 255 : 0),
  };
}

export function sampleCoverage(mask: PaintMask, x: number, y: number) {
  const col = clamp01((x - mask.x) / (mask.step * (SIZE - 1))) * (SIZE - 1);
  const row = clamp01((y - mask.y) / (mask.step * (SIZE - 1))) * (SIZE - 1);
  const i = Math.floor(col),
    j = Math.floor(row);
  const nextI = Math.min(i + 1, SIZE - 1),
    nextJ = Math.min(j + 1, SIZE - 1);
  const u = col - i,
    v = row - j;
  const a =
    mask.pixels[j * SIZE + i] * (1 - u) + mask.pixels[j * SIZE + nextI] * u;
  const b =
    mask.pixels[nextJ * SIZE + i] * (1 - u) +
    mask.pixels[nextJ * SIZE + nextI] * u;
  return (a * (1 - v) + b * v) / 255;
}

export interface Brush {
  radius: number;
  softness: number;
  erase: boolean;
  opacity?: number;
}

// Sweep the brush along each segment in XY. Using the nearest point on the
// stroke gives a continuous feather and keeps the result independent of the
// number of pointer events, including when a finger moves quickly.
export function paintSegment(
  mask: PaintMask,
  start: Point,
  end: Point,
  brush: Brush,
) {
  const radius = brush.radius;
  const minCol = Math.max(
    0,
    Math.floor((Math.min(start.x, end.x) - radius - mask.x) / mask.step),
  );
  const maxCol = Math.min(
    SIZE - 1,
    Math.ceil((Math.max(start.x, end.x) + radius - mask.x) / mask.step),
  );
  const minRow = Math.max(
    0,
    Math.floor((Math.min(start.y, end.y) - radius - mask.y) / mask.step),
  );
  const maxRow = Math.min(
    SIZE - 1,
    Math.ceil((Math.max(start.y, end.y) + radius - mask.y) / mask.step),
  );
  const dx = end.x - start.x,
    dy = end.y - start.y;
  const squared = dx * dx + dy * dy;
  for (let row = minRow; row <= maxRow; row++) {
    const y = mask.y + row * mask.step - start.y;
    for (let col = minCol; col <= maxCol; col++) {
      const x = mask.x + col * mask.step - start.x;
      const t = squared ? clamp01((x * dx + y * dy) / squared) : 0;
      const distance = Math.hypot(x - dx * t, y - dy * t);
      if (distance >= radius) continue;
      const value = Math.round(
        255 *
          (brush.opacity ?? 1) *
          smooth(
            clamp01((1 - distance / radius) / Math.max(0.001, brush.softness)),
          ),
      );
      const index = row * SIZE + col;
      mask.pixels[index] = brush.erase
        ? Math.min(mask.pixels[index], 255 - value)
        : Math.max(mask.pixels[index], value);
    }
  }
}
