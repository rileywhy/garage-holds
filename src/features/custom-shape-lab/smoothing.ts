import type { MaskDocument } from "./mask";

// Smooth at the brush's physical scale, changing only its swept footprint.
export function smoothMaskStroke(
  material: Uint8Array,
  size: number,
  from: [number, number],
  to: [number, number],
  diameter: number,
  strength: number,
  pixelWidth = 1,
  pixelHeight = 1,
) {
  if (strength <= 0 || diameter <= 0) return;
  const source = material.slice();
  const radius = diameter / 2;
  const sigma = Math.max(
    Math.min(pixelWidth, pixelHeight) / 2,
    diameter * 0.16 * Math.min(1, strength),
  );
  function kernel(pixel: number) {
    const extent = Math.min(size - 1, Math.ceil((3 * sigma) / pixel));
    const weights = Array.from({ length: extent * 2 + 1 }, (_, i) =>
      Math.exp(-0.5 * (((i - extent) * pixel) / sigma) ** 2),
    );
    const total = weights.reduce((a, b) => a + b, 0);
    return { extent, weights: weights.map((weight) => weight / total) };
  }
  const horizontal = kernel(pixelWidth),
    vertical = kernel(pixelHeight);
  const xMin = Math.max(
    0,
    Math.floor(Math.min(from[0], to[0]) - radius / pixelWidth),
  );
  const xMax = Math.min(
    size - 1,
    Math.ceil(Math.max(from[0], to[0]) + radius / pixelWidth),
  );
  const yMin = Math.max(
    0,
    Math.floor(Math.min(from[1], to[1]) - radius / pixelHeight),
  );
  const yMax = Math.min(
    size - 1,
    Math.ceil(Math.max(from[1], to[1]) + radius / pixelHeight),
  );
  const blurred = new Float32Array(size * size);
  for (
    let y = Math.max(0, yMin - vertical.extent);
    y <= Math.min(size - 1, yMax + vertical.extent);
    y++
  ) {
    for (let x = xMin; x <= xMax; x++) {
      let sum = 0;
      for (let k = 0; k < horizontal.weights.length; k++) {
        const xx = Math.max(0, Math.min(size - 1, x + k - horizontal.extent));
        sum += source[y * size + xx] * horizontal.weights[k];
      }
      blurred[y * size + x] = sum;
    }
  }
  const dx = (to[0] - from[0]) * pixelWidth,
    dy = (to[1] - from[1]) * pixelHeight;
  const length = dx * dx + dy * dy;
  const candidates: { index: number; score: number }[] = [];
  let paintedCount = 0;
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const px = (x + 0.5 - from[0]) * pixelWidth,
        py = (y + 0.5 - from[1]) * pixelHeight;
      const t = length
        ? Math.max(0, Math.min(1, (px * dx + py * dy) / length))
        : 0;
      if ((px - t * dx) ** 2 + (py - t * dy) ** 2 > radius * radius) continue;
      let sum = 0;
      for (let k = 0; k < vertical.weights.length; k++) {
        const yy = Math.max(0, Math.min(size - 1, y + k - vertical.extent));
        sum += blurred[yy * size + x] * vertical.weights[k];
      }
      const index = y * size + x;
      paintedCount += source[index];
      candidates.push({ index, score: sum });
    }
  }
  // Preserve the painted area inside the brush. A fixed 50% threshold erodes
  // narrow cuts on every pointer event, eventually deleting them entirely.
  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      source[b.index] - source[a.index] ||
      a.index - b.index,
  );
  for (let i = 0; i < candidates.length; i++)
    material[candidates[i].index] = i < paintedCount ? 1 : 0;
}

export function smoothStroke(
  doc: MaskDocument,
  from: [number, number],
  to: [number, number],
  diameter: number,
  strength: number,
) {
  smoothMaskStroke(doc.material, doc.size, from, to, diameter, strength);
}
