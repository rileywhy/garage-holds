// The schema is supplied by Python, so limits and defaults have one authority.
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
  bolts?: [number, number][];
  dimensions: number[];
  material_grams: [number, number];
  triangles: number;
  parameters: Parameters;
  adjusted: Record<string, number>;
  design: Design;
}
export const DESIGN_FILE_LIMIT = 16384;

export async function loadSchema(
  kind: "sloper" | "jug" = "sloper",
): Promise<Schema> {
  const response = await fetch(`/api/${kind}`);
  if (!response.ok) throw new Error(`${kind} generator is not configured.`);
  return response.json();
}

export async function post(
  action: "preview" | "stl" | "validate",
  parameters: Parameters,
  signal?: AbortSignal,
  kind: "sloper" | "jug" = "sloper",
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
  kind: "sloper" | "jug" = "sloper",
): Parameters {
  const design = JSON.parse(text) as Partial<Design> | null;
  if (
    !design ||
    design.generator !== `garage-holds-${kind}` ||
    design.version !== (kind === "jug" ? 2 : 1) ||
    design.units !== "mm" ||
    !design.parameters ||
    typeof design.parameters !== "object" ||
    Array.isArray(design.parameters)
  )
    throw new Error(
      `this is not a ${kind === "jug" ? "Jug" : "Sloper"} Lab settings file.`,
    );
  return kind === "sloper"
    ? { incut: 0, ...design.parameters }
    : design.parameters;
}
