// Custom Shape Lab links. The sliders travel as readable query values like
// the other labs; the painted silhouette is a 256×256 bitmap, so it travels
// packed to bits, deflated, and base64url-encoded in ?mask=, with the
// mounting holes as ?holes=x,y;x,y in canvas pixels. A simple blob is a few
// hundred characters; a very detailed drawing can exceed what a link should
// carry, and then the lab says so instead of writing one.

import type { MountingHole } from "./mask";

export const MASK_KEY = "mask";
export const HOLES_KEY = "holes";
// Longer than this and chat apps, Reddit and some browsers start to truncate.
export const LINK_LIMIT = 6000;

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replaceAll("-", "+").replaceAll("_", "/");
  try {
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function pipe(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
) {
  const body = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

export function linkCodecAvailable() {
  return (
    typeof CompressionStream !== "undefined" &&
    typeof DecompressionStream !== "undefined"
  );
}

// 0/1 cells → packed bits → deflate → base64url.
export async function encodeMask(material: Uint8Array): Promise<string> {
  const packed = new Uint8Array(Math.ceil(material.length / 8));
  for (let i = 0; i < material.length; i++)
    if (material[i]) packed[i >> 3] |= 0x80 >> (i & 7);
  return toBase64Url(await pipe(packed, new CompressionStream("deflate-raw")));
}

// The inverse; null for anything that is not a mask of the expected size.
export async function decodeMask(
  text: string,
  cells: number,
): Promise<Uint8Array | null> {
  const packed = fromBase64Url(text);
  if (!packed || !packed.length) return null;
  let bytes: Uint8Array;
  try {
    bytes = await pipe(packed, new DecompressionStream("deflate-raw"));
  } catch {
    return null;
  }
  if (bytes.length !== Math.ceil(cells / 8)) return null;
  const material = new Uint8Array(cells);
  for (let i = 0; i < cells; i++)
    material[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
  return material;
}

export function holesToLink(holes: MountingHole[]): string {
  return holes
    .map((h) => `${Number(h.x.toFixed(1))},${Number(h.y.toFixed(1))}`)
    .join(";");
}

export function holesFromLink(text: string, size: number): MountingHole[] {
  const holes: MountingHole[] = [];
  for (const pair of text.split(";")) {
    const [x, y] = pair.split(",").map(Number);
    if (![x, y].every((v) => Number.isFinite(v) && v >= 0 && v < size))
      continue;
    holes.push({ id: `link-${holes.length}`, x, y });
    if (holes.length === 12) break;
  }
  return holes;
}
