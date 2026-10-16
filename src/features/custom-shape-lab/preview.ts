import { smoothPreviewGeometry } from "../model-viewer/smooth-preview-geometry";

// Little-endian header: vertex count, triangle count, volume, seat height.
// Remaining bytes contain float32 positions and uint32 triangle indices.
export function decodePreview(buffer: ArrayBuffer) {
  if (buffer.byteLength < 24) throw new Error("Incomplete preview mesh.");
  const header = new DataView(buffer);
  const vertices = header.getUint32(0, true);
  const triangles = header.getUint32(4, true);
  if (
    !vertices ||
    !triangles ||
    buffer.byteLength !== 24 + (vertices + triangles) * 12
  )
    throw new Error("Invalid preview mesh.");
  return {
    positions: new Float32Array(buffer, 24, vertices * 3),
    indices: new Uint32Array(buffer, 24 + vertices * 12, triangles * 3),
    volume_cm3: header.getFloat64(8, true),
    seatDepth: header.getFloat64(16, true),
  };
}

export function previewMesh(data: ReturnType<typeof decodePreview>) {
  return smoothPreviewGeometry(data);
}
