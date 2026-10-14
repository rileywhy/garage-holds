// The hosted generator's contract (api/crimp.py). The schema is fetched at
// load so Python stays the one source of limits, defaults, and presets.

export interface Control {
  key: string;
  label: string;
  group: "Grip" | "Shape" | "Mounting";
  min: number;
  max: number;
  step: number;
  unit: string;
  help: string;
}

export type Parameters = Record<string, number | boolean>;

export interface Schema {
  version: number;
  defaults: Parameters;
  controls: Control[];
  presets: Record<string, Parameters>;
}

export interface Design {
  generator: string;
  version: number;
  units: string;
  parameters: Parameters;
}

export interface Preview {
  control_limits?: Record<string, number>;
  control_ranges?: Record<string, { min?: number; max?: number }>;
  vertices: number[][];
  faces: number[][];
  profile: [number, number][];
  screws: [number, number][];
  bolts?: [number, number][];
  grip_inner: [number, number];
  grip_outer: [number, number];
  dimensions: number[];
  volume_cm3: number;
  material_grams: [number, number];
  // Where the countersink starts above the wall, as used (auto or by hand).
  seat_depth: number;
  // Settings the generator changed to make the shape work, e.g. a taller
  // body so the screws fit. The design's parameters already include them.
  adjusted: Record<string, number>;
  triangles: number;
  screw_spacing: number | null;
  // The lip radius actually used: smaller than asked when the edge is short.
  lip_radius: number;
  watertight: boolean;
  design: Design;
}

export function limitControl(
  control: Control,
  preview: Preview | null,
): Control {
  const range = preview?.control_ranges?.[control.key];
  const available = range?.max ?? preview?.control_limits?.[control.key];
  const minimum =
    range?.min != null && Number.isFinite(range.min)
      ? Math.max(control.min, Math.min(control.max, range.min))
      : control.min;
  if (available == null && minimum === control.min) return control;
  const max = Math.max(
    minimum,
    Math.min(control.max, available ?? control.max),
  );
  return {
    ...control,
    min: minimum,
    max,
    help: `${control.help} Current geometry allows ${minimum}–${max} ${control.unit}.`,
  };
}

export const DESIGN_FILE_LIMIT = 16384;

export async function loadSchema(): Promise<Schema> {
  const response = await fetch("/api/crimp");
  if (!response.ok) throw new Error("Could not load the generator.");
  return response.json();
}

export async function post(
  action: "preview" | "stl" | "validate",
  parameters: Parameters,
  signal?: AbortSignal,
) {
  const response = await fetch("/api/crimp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, parameters }),
    signal,
  });
  if (!response.ok) {
    let message = "The generator could not complete this request.";
    try {
      message = (await response.json()).error || message;
    } catch {
      // Not JSON: keep the generic message.
    }
    throw new Error(message);
  }
  return response;
}

// A settings file saved by this page or by the local tool.
export function parseDesignFile(text: string): Parameters {
  const design = JSON.parse(text) as Partial<Design>;
  if (
    design.generator !== "garage-holds-crimp" ||
    design.version !== 1 ||
    design.units !== "mm" ||
    !design.parameters ||
    typeof design.parameters !== "object" ||
    Array.isArray(design.parameters)
  )
    throw new Error("This file is not a Crimp Lab settings file.");
  // Designs saved before the count control had exactly two holes, and
  // ones saved before the automatic seat chose their seat by hand.
  const saved = { ...design.parameters };
  if (!("screw_count" in saved)) saved.screw_count = 2;
  if (!("auto_seat" in saved)) saved.auto_seat = false;
  return saved;
}
