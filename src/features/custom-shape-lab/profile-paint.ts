import { cloneCut, type CutProfile } from "./cut-profiles";
import { smoothMaskStroke } from "./smoothing";

export const CUT_RESOLUTION = 256;
export function paintProfile(
  cut: CutProfile,
  from: [number, number],
  to: [number, number],
  diameter: number,
  erase: boolean,
  min: number,
  max: number,
  height: number,
  bottom = 0,
  top = height,
): CutProfile {
  const next = cloneCut(cut);
  let paint = next.paint ?? {
    size: CUT_RESOLUTION,
    min,
    max,
    bottom,
    top,
    material: Array(CUT_RESOLUTION ** 2).fill(0),
  };
  if (
    paint.size < CUT_RESOLUTION ||
    min < paint.min ||
    max > paint.max ||
    bottom < (paint.bottom ?? 0) ||
    top > (paint.top ?? height)
  ) {
    const previous = paint;
    const nextMin = Math.min(min, previous.min),
      nextMax = Math.max(max, previous.max),
      nextBottom = Math.min(bottom, previous.bottom ?? 0),
      nextTop = Math.max(top, previous.top ?? height);
    paint = {
      ...previous,
      min: nextMin,
      max: nextMax,
      bottom: nextBottom,
      top: nextTop,
      size: CUT_RESOLUTION,
      material: Array.from({ length: CUT_RESOLUTION ** 2 }, (_, i) => {
        const x =
          nextMin +
          (((i % CUT_RESOLUTION) + 0.5) / CUT_RESOLUTION) * (nextMax - nextMin);
        const z =
          nextTop -
          ((Math.floor(i / CUT_RESOLUTION) + 0.5) / CUT_RESOLUTION) *
            (nextTop - nextBottom);
        const col = Math.floor(
          ((x - previous.min) / (previous.max - previous.min)) * previous.size,
        );
        const row = Math.floor(
          (((previous.top ?? height) - z) /
            ((previous.top ?? height) - (previous.bottom ?? 0))) *
            previous.size,
        );
        return col >= 0 &&
          col < previous.size &&
          row >= 0 &&
          row < previous.size
          ? previous.material[row * previous.size + col]
          : 0;
      }),
    };
  }
  const material = Uint8Array.from(paint.material);
  // An elliptical footprint in pixels is a circular brush in millimeters.
  const dx = to[0] - from[0],
    dz = to[1] - from[1],
    length = dx * dx + dz * dz,
    radius = diameter / 2;
  const pixelWidth = (paint.max - paint.min) / paint.size,
    paintTop = paint.top ?? height,
    pixelHeight = (paintTop - (paint.bottom ?? 0)) / paint.size;
  const firstX = Math.max(
      0,
      Math.floor((Math.min(from[0], to[0]) - radius - paint.min) / pixelWidth),
    ),
    lastX = Math.min(
      paint.size - 1,
      Math.ceil((Math.max(from[0], to[0]) + radius - paint.min) / pixelWidth),
    ),
    firstY = Math.max(
      0,
      Math.floor((paintTop - Math.max(from[1], to[1]) - radius) / pixelHeight),
    ),
    lastY = Math.min(
      paint.size - 1,
      Math.ceil((paintTop - Math.min(from[1], to[1]) + radius) / pixelHeight),
    );
  for (let y = firstY; y <= lastY; y++)
    for (let x = firstX; x <= lastX; x++) {
      const px = paint.min + (x + 0.5) * pixelWidth,
        z = paintTop - (y + 0.5) * pixelHeight;
      const t = length
        ? Math.max(
            0,
            Math.min(1, ((px - from[0]) * dx + (z - from[1]) * dz) / length),
          )
        : 0;
      if (
        (px - from[0] - dx * t) ** 2 + (z - from[1] - dz * t) ** 2 <=
        radius ** 2
      )
        material[y * paint.size + x] = erase ? 0 : 1;
    }
  next.paint = { ...paint, material: Array.from(material) };
  return next;
}
export function smoothPaintStroke(
  cut: CutProfile,
  from: [number, number],
  to: [number, number],
  diameter: number,
  strength: number,
  height: number,
): CutProfile {
  const next = cloneCut(cut);
  if (!next.paint) return next;
  const paint = next.paint;
  const top = paint.top ?? height;
  const pixelWidth = (paint.max - paint.min) / paint.size;
  const pixelHeight = (top - (paint.bottom ?? 0)) / paint.size;
  const point = ([x, z]: [number, number]): [number, number] => [
    (x - paint.min) / pixelWidth,
    (top - z) / pixelHeight,
  ];
  const material = Uint8Array.from(paint.material);
  smoothMaskStroke(
    material,
    paint.size,
    point(from),
    point(to),
    diameter,
    strength,
    pixelWidth,
    pixelHeight,
  );
  paint.material = Array.from(material);
  return next;
}
