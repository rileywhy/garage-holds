import { KIND_LABELS, type Kind } from "@/features/hold-lab/api";
import type { ModelFile } from "@/features/holds/types";
import { MAX_STL_PREVIEW_BYTES } from "@/features/holds/stl-limits";

export interface HoldSourceOption {
  id: string;
  label: string;
  link: string;
  group: "Lab presets" | "Saved holds" | "This browser";
  lab?: Kind;
}

export function canImportPreset(lab: string): lab is Kind {
  return Object.hasOwn(KIND_LABELS, lab);
}

export function canImportStl(file: ModelFile) {
  return (
    file.extension.replace(/^\./, "").toLowerCase() === "stl" &&
    file.bytes <= MAX_STL_PREVIEW_BYTES &&
    Boolean(file.url)
  );
}

export function textureLabHref(source: "hold" | "preset", id: string) {
  return `/make/texture?${new URLSearchParams({ [source]: id })}`;
}
