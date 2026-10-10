import type { License } from "./licenses";

export const HOLD_TYPES = [
  "Jug",
  "Crimp",
  "Sloper",
  "Pinch",
  "Pocket",
  "Foothold",
] as const;
export const HOLD_SIZES = ["Small", "Medium", "Large"] as const;
export const MOUNT_TYPES = ["Bolt-on", "Screw-on", "Dual mount"] as const;
export const MATERIALS = ["PETG", "PETG-CF", "PLA", "ASA", "Nylon"] as const;
export const SPECIAL_PROCESSES = [
  "Salt annealing (heat treatment in salt)",
  "Printing with liquid resin",
  "Making a pattern to cast holds",
  "Other (describe in notes)",
] as const;
export type HoldType = (typeof HOLD_TYPES)[number];
export type HoldSize = (typeof HOLD_SIZES)[number];
export type MountType = (typeof MOUNT_TYPES)[number];
export type SpecialProcess = (typeof SPECIAL_PROCESSES)[number];
export type Illustration =
  "ripple" | "edge" | "pebble" | "pinch" | "pocket" | "foot";

export interface ModelFile {
  id: string;
  name: string;
  bytes: number;
  extension: string;
  // Short-lived signed download URL; empty when storage is unavailable.
  url: string;
}

export interface Photo {
  id: string;
  url: string;
}

export interface PrintRecipe {
  material: string;
  specialProcess: SpecialProcess | null;
  notes: string;
  textureNotes: string;
  postProcessing: string;
}

// What a creator supplies when uploading or editing. Everything else on a
// Hold is derived by the server.
export interface DesignInput {
  title: string;
  description: string;
  type: HoldType;
  size: HoldSize;
  mount: MountType;
  problemGrade: number | null;
  recipes: PrintRecipe[];
  tags: string[];
  license: License;
}

export interface Hold extends DesignInput {
  id: string;
  ownerId: string | null;
  creator: string;
  status: "draft" | "published";
  color: string;
  illustration: Illustration;
  photos: Photo[];
  files: ModelFile[];
  createdAt: string;
  isSample: boolean;
}

export interface Review {
  id: string;
  holdId: string;
  authorId: string;
  author: string;
  rating: number;
  text: string;
  material: string;
  printSettings: string;
  postProcessing: string;
  problemGrade: number | null;
  createdAt: string;
}

export interface HoldFilters {
  query: string;
  types: HoldType[];
  sizes: HoldSize[];
  mounts: MountType[];
  materials: string[];
  specialProcesses: SpecialProcess[];
  targetGrade: number | null;
  sort: "featured" | "newest" | "title";
}

export const DEFAULT_FILTERS: HoldFilters = {
  query: "",
  types: [],
  sizes: [],
  mounts: [],
  materials: [],
  specialProcesses: [],
  targetGrade: null,
  sort: "featured",
};
