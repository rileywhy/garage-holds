// One scale for both axes keeps millimeter measurements and the brush circular.
export function profileViewport(
  min: number,
  max: number,
  depth: number,
  zMin = 0,
  zMax = depth,
) {
  const width = 640,
    height = 420,
    pad = 38;
  const scale = Math.min(
    (width - 2 * pad) / (max - min),
    (height - 2 * pad) / (zMax - zMin),
  );
  const left = (width - (max - min) * scale) / 2;
  const bottom = (height + (zMax - zMin) * scale) / 2;
  return {
    scale,
    left,
    bottom,
    right: width - left,
    top: height - bottom,
    x: (mm: number) => left + (mm - min) * scale,
    y: (mm: number) => bottom - (mm - zMin) * scale,
    point: (x: number, y: number): [number, number] => [
      Math.max(min, Math.min(max, min + (x - left) / scale)),
      Math.max(zMin, Math.min(zMax, zMin + (bottom - y) / scale)),
    ],
  };
}
