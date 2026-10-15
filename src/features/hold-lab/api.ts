// The schema is supplied by Python, so limits and defaults have one authority.
// Sloper, Jug and Foot Labs share this contract and the HoldLab component;
// only the generator behind /api/<kind> differs.
export type Kind = "sloper" | "jug" | "foot";
export const KIND_LABELS: Record<Kind, string> = {
  sloper: "Sloper",
  jug: "Jug",
  foot: "Foot",
};
// The settings-file version each generator writes (design_document).
const DESIGN_VERSIONS: Record<Kind, number> = { sloper: 1, jug: 2, foot: 2 };

export interface Control {
  key: string;
  label: string;
  group: "Grip" | "Shape" | "Mounting";
  min: number;
  max: number;
  step: number;
  unit: string;
  help: string;
  // Foot Lab: the body shapes this control applies to; absent means all.
  shapes?: string[];
}
export type Parameters = Record<string, number | boolean | string>;
export interface Schema {
  defaults: Parameters;
  controls: Control[];
  presets: Record<string, Parameters>;
  // Foot Lab: the body shapes a design can switch between, key → label.
  shapes?: Record<string, string>;
  // Foot Lab: the generator can pick the screw count from the body size.
  autoScrewCount?: boolean;
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
  screw_arc_limit?: number | null;
  seat_depth_limit?: number | null;
  vertices: number[][];
  faces: number[][];
  profile: [number, number][];
  screws: [number, number][];
  bolts?: [number, number][];
  dimensions: number[];
  material_grams: [number, number];
  triangles: number;
  parameters: Parameters;
  adjusted: Record<string, number>;
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

export async function loadSchema(kind: Kind = "sloper"): Promise<Schema> {
  const response = await fetch(`/api/${kind}`);
  if (!response.ok) throw new Error(`${kind} generator is not configured.`);
  return response.json();
}

export async function post(
  action: "preview" | "stl" | "validate",
  parameters: Parameters,
  signal?: AbortSignal,
  kind: Kind = "sloper",
) {
  const response = await fetch(`/api/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, parameters }),
    signal,
  });
  if (!response.ok) {
    let message = "the generator could not complete this request.";
    try {
      message = (await response.json()).error || message;
    } catch {
      /* Non-JSON failures keep the fallback. */
    }
    throw new Error(message);
  }
  return response;
}

export function parseDesignFile(
  text: string,
  kind: Kind = "sloper",
): Parameters {
  const design = JSON.parse(text) as Partial<Design> | null;
  if (
    !design ||
    design.generator !== `garage-holds-${kind}` ||
    design.version !== DESIGN_VERSIONS[kind] ||
    design.units !== "mm" ||
    !design.parameters ||
    typeof design.parameters !== "object" ||
    Array.isArray(design.parameters)
  )
    throw new Error(`this is not a ${KIND_LABELS[kind]} Lab settings file.`);
  return kind === "sloper"
    ? { incut: 0, ...design.parameters }
    : design.parameters;
}
