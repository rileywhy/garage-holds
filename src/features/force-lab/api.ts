// The force lab's contract with api/jug_force.py (see
// tools/jug-force-lab/contract.py). Python owns every limit, default and
// material figure; the page fetches them at load.
import type { Control, Parameters, Toggle } from "@/features/hold-lab/api";
import { labRequest } from "@/features/labs/lab-request";

export const FORCE_API = "/api/jug_force";

export interface Load {
  force: number;
  wall_angle: number;
  pull_angle: number;
  side_angle: number;
  position: number;
  height: number;
  width: number;
  point: [number, number, number] | null;
}

export interface Wall {
  label: string;
  thickness: number;
  crush: number;
  anchor_pullout: number;
  colour: string;
  note: string;
}

export interface Screw {
  label: string;
  diameter: number;
  head: number;
  tensile: number;
  shear: number;
  note: string;
}

export interface Hold {
  label: string;
  layer_tension: number;
  layer_shear: number;
  in_layer: number;
  note: string;
}

// One Hold Lab generator's settings, as its own lab serves them.
export interface KindSchema {
  label: string;
  controls: Control[];
  presets: Record<string, Parameters>;
  defaults: Parameters;
  shapes: Record<string, string> | null;
  shapeLabel: string | null;
  toggles: Toggle[];
}

export interface ForceSchema {
  kinds: Record<string, KindSchema>;
  default_kind: string;
  turns: number[];
  materials: {
    walls: Record<string, Wall>;
    holds: Record<string, Hold>;
    screws: Record<string, Screw>;
    // Ultimate pull-out per mm of thread, N/mm: wall → screw → value.
    pullout_per_mm: Record<string, Record<string, number>>;
  };
  load: {
    defaults: Load;
    limits: Record<Exclude<keyof Load, "point">, [number, number]>;
  };
  screw_length: number;
  screw: string;
}

// What to load: a generator with its settings, or a pile hold by its
// signed model link.
export type Source =
  | { kind: string; settings: Parameters; turn: number }
  | {
      pile: { url: string; orientation: string; title: string };
      turn: number;
    };

export interface Fastener {
  kind: "screw" | "bolt";
  name: string;
  x: number;
  y: number;
  seat: number;
  head: number;
  shank: number;
  thread: number;
  tension: number;
  shear: number;
  capacity: {
    wall: number;
    pull_through: number;
    steel: number;
    shear: number;
  };
  governing: number;
}

export interface Check {
  part: string;
  mode: string;
  use: number;
}

export interface Layer {
  z: number;
  sigma: number;
  tau: number;
  use: number;
}

// The stress in every brick of the solve, for cut-away views: flat brick
// index ((i * ny) + j) * nz + k.
export interface StressGrid {
  origin: [number, number, number];
  h: number;
  shape: [number, number, number];
  index: number[];
  sigma: number[];
  use: number[];
}

export interface Analysis {
  source: {
    label: string;
    kind: string;
    holes: number;
    dimensions: [number, number, number];
  };
  load: Load & {
    point: [number, number, number];
    direction: [number, number, number];
    components: [number, number, number];
    normal: [number, number, number];
    pressing: boolean;
  };
  wall: Wall & { key: string };
  hold: Hold & { key: string };
  screw_length: number;
  screw: Screw & { key: string; pullout_per_mm: number };
  mesh: {
    vertices?: number[];
    faces?: number[];
    use: number[];
    sigma: number[];
  };
  pressure: {
    x0: number;
    y0: number;
    step: number;
    nx: number;
    ny: number;
    values: number[];
    max: number;
  };
  fasteners: Fastener[];
  layers: Layer[];
  checks: Check[];
  summary: {
    governing: Check;
    failure_force: number | null;
    safety: number | null;
    contact_force: number;
    lifted: number;
    max_pressure: number;
    worst_layer: Layer;
    peak: {
      point: [number, number, number];
      use: number;
      sigma: number;
      across: boolean;
    };
    total_tension: number;
  };
  parameters: Parameters;
  notes: string[];
  grid?: StressGrid;
}

export interface AnalysisRequest {
  source: Source;
  load: Load;
  wall: string;
  hold: string;
  screw: string;
  screw_length: number;
  mesh: boolean;
  grid: boolean;
}

export async function fetchSchema(signal?: AbortSignal): Promise<ForceSchema> {
  return (await labRequest(FORCE_API, { signal })).json();
}

export async function analyze(
  request: AnalysisRequest,
  signal?: AbortSignal,
): Promise<Analysis> {
  const response = await labRequest(FORCE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  return response.json();
}
