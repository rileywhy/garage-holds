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
  vertices: number[][];
  faces: number[][];
  profile: [number, number][];
  screws: [number, number][];
  grip_inner: [number, number];
  grip_outer: [number, number];
  dimensions: number[];
  volume_cm3: number;
  triangles: number;
  screw_spacing: number | null;
  watertight: boolean;
  design: Design;
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
  // Designs saved before the count control had exactly two holes.
  const saved = { ...design.parameters };
  if (!("screw_count" in saved)) saved.screw_count = 2;
  return saved;
}
