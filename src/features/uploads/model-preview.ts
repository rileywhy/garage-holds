import {
  MAX_STL_PREVIEW_BYTES,
  MAX_STL_PREVIEW_TRIANGLES,
} from "@/features/holds/stl-limits";
import { modelPreviewKey } from "@/features/holds/rows";

// A simplified copy for models the browser preview would refuse (RIL-87).
// The copy is made by the preview_mesh function (api/preview_mesh.py),
// which downloads the original from a signed GET URL, decimates it, and
// stores the copy through a signed PUT URL, so the bytes never pass
// through this server. Plain TypeScript with the I/O passed in, so the
// decisions here are testable; model-previews.ts binds R2 and the function.

// Well inside the browser's limits with the surface still smooth: 150k
// triangles is a 7.5 MB binary STL.
export const PREVIEW_TARGET_TRIANGLES = 150_000;
export const STL_HEADER_BYTES = 84;

export interface ModelPreviewDeps {
  readHead(objectKey: string, length: number): Promise<Uint8Array>;
  signSource(objectKey: string, name: string): Promise<string>;
  signTarget(objectKey: string): Promise<string>;
  decimate(request: {
    source: string;
    target: string;
    triangles: number;
  }): Promise<{ triangles: number; bytes: number }>;
}

// A binary STL's triangle count from its header, when the file's size
// agrees with it; null for an ASCII STL or anything that is not an STL.
export function binaryStlTriangles(
  head: Uint8Array,
  bytes: number,
): number | null {
  if (head.length < STL_HEADER_BYTES) return null;
  const count = new DataView(
    head.buffer,
    head.byteOffset,
    head.byteLength,
  ).getUint32(80, true);
  return STL_HEADER_BYTES + 50 * count === bytes ? count : null;
}

// Whether the browser preview would refuse this STL as uploaded. Mirrors
// the checks in stl-geometry.ts: size first, then the triangle count.
export function stlNeedsPreview(bytes: number, head: Uint8Array): boolean {
  if (bytes > MAX_STL_PREVIEW_BYTES) return true;
  const triangles = binaryStlTriangles(head, bytes);
  return triangles !== null && triangles > MAX_STL_PREVIEW_TRIANGLES;
}

// Makes the copy for one ready model file and returns its object key, or
// null when the file is not an STL or is small enough as it is. Throws
// when the function or the bucket fails; callers log and move on.
export async function createModelPreview(
  file: { object_key: string; name: string; bytes: number; extension: string },
  deps: ModelPreviewDeps,
): Promise<string | null> {
  if (file.extension !== "stl") return null;
  const head = await deps.readHead(file.object_key, STL_HEADER_BYTES);
  if (!stlNeedsPreview(file.bytes, head)) return null;
  const previewKey = modelPreviewKey(file.object_key);
  const result = await deps.decimate({
    source: await deps.signSource(file.object_key, file.name),
    target: await deps.signTarget(previewKey),
    triangles: PREVIEW_TARGET_TRIANGLES,
  });
  if (!(result.bytes > 0) || !(result.triangles > 0))
    throw new Error("The preview copy came back empty.");
  return previewKey;
}
