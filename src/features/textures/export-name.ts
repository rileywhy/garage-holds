import type { TexturePattern } from "./height-map";

function filenamePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

export function texturePngFilename(settings: {
  pattern: TexturePattern;
  seed: number;
  density: number;
  contrast: number;
  detail?: number;
  rotation?: number;
}) {
  const { pattern, seed, density, contrast, detail, rotation = 0 } = settings;
  const grain = detail === undefined ? "" : `-grain${detail}`;
  const turn = rotation ? `-rot${Math.round(rotation * 10) / 10}` : "";
  return `${pattern}--seed${seed}-density${density}-contrast${contrast}${grain}${turn}.png`;
}

export function texturedStlFilename(settings: {
  hold: string;
  pattern: TexturePattern;
  tileMm: number;
  depthMm: number;
  reverse: boolean;
  painted: boolean;
  seed: number;
}) {
  const { hold, pattern, tileMm, depthMm, reverse, painted, seed } = settings;
  const name = filenamePart(hold.replace(/\.stl$/i, "")) || "hold";
  const mode = `${reverse ? "-reversed" : ""}${painted ? "-painted" : ""}`;
  return `${name}--${pattern}--tile${tileMm}mm-depth${depthMm}mm${mode}-seed${seed}.stl`;
}
