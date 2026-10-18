// The generator contract behind the Crimp, Sloper, Jug, Foot, Pocket and
// Pinch Labs. GET /api/<kind> returns the control schema; POST runs an
// action on a set of settings. Python is the one source of limits, defaults
// and presets, so a lab fetches its schema at load instead of repeating any
// of it here.
import {
  EXPORT_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  labRequest,
} from "@/features/labs/lab-request";

export type Kind = "crimp" | "sloper" | "jug" | "foot" | "pocket" | "pinch";
export const KIND_LABELS: Record<Kind, string> = {
  crimp: "Crimp",
  sloper: "Sloper",
  jug: "Jug",
  foot: "Foot",
  pocket: "Pocket",
  pinch: "Pinch",
};

export interface Control {
  key: string;
  label: string;
  group: "Grip" | "Shape" | "Mounting";
  min: number;
  max: number;
  step: number;
  unit: string;
  help: string;
  // Foot and Pinch Labs: the shapes this control applies to; absent means
  // all.
  shapes?: string[];
  // A switch (see Toggle) that hides this control while it is on: the
  // Pocket Lab's depth has no meaning once the pocket opens to the wall.
  hidden_by?: string;
}
// A boolean setting shown as a checkbox above its tab's sliders.
export interface Toggle {
  key: string;
  label: string;
  group: Control["group"];
  help?: string;
}
export type Parameters = Record<string, number | boolean | string>;
export interface Schema {
  defaults: Parameters;
  controls: Control[];
  presets: Record<string, Parameters>;
  // Foot and Pinch Labs: the shapes a design can switch between, key →
  // label, and what the menu is called when it is not the body's shape.
  shapes?: Record<string, string>;
  shapeLabel?: string;
  // Foot Lab: the generator can pick the screw count from the body size.
  autoScrewCount?: boolean;
  // Pocket and Pinch Labs: switches the generator declares, beside the
  // mounting ones every lab has.
  toggles?: Toggle[];
}
// A settings file, as a lab or the local tool saves it.
export interface Design {
  generator: string;
  version: number;
  units: string;
  parameters: Parameters;
}
export interface Preview {
  // Slider limits the current geometry imposes; see limitControl.
  control_limits?: Record<string, number>;
  control_ranges?: Record<string, { min?: number; max?: number }>;
  vertices: number[][];
  faces: number[][];
  profile: [number, number][];
  screws: [number, number][];
  bolts?: [number, number][];
  dimensions: number[];
  material_grams: [number, number];
  triangles: number;
  // Settings the generator changed to make the shape work, e.g. a taller
  // body so the screws fit. The design's parameters already include them.
  adjusted: Record<string, number>;
  design: Design;
  // Sloper, jug, foot, pocket and pinch: the complete settings as built,
  // which the sliders then show.
  parameters?: Parameters;
  // Pocket: the material left behind the pocket, zero when it opens to the
  // wall, and every outline of the centre section, which an open pocket
  // splits in two (profile is the larger).
  floor?: number;
  profiles?: [number, number][][];
  // The crimp generator reports its fitted values beside the settings, and
  // the Crimp Lab shows them: where the grip starts and ends in the
  // profile, where the countersink starts above the wall (auto or by
  // hand), the outer screw span (null with fewer than two screws), and the
  // lip radius actually used, smaller than asked when the edge is short.
  grip_inner?: [number, number];
  grip_outer?: [number, number];
  seat_depth?: number;
  screw_spacing?: number | null;
  lip_radius?: number;
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
    help: `${control.help} Current geometry allows ${Number(minimum.toFixed(2))}–${Number(max.toFixed(2))} ${control.unit}.`,
  };
}

export const DESIGN_FILE_LIMIT = 16384;

export async function loadSchema(kind: Kind): Promise<Schema> {
  const response = await labRequest(`/api/${kind}`);
  return response.json();
}

export async function post(
  kind: Kind,
  action: "preview" | "stl" | "validate",
  parameters: Parameters,
  signal?: AbortSignal,
) {
  return labRequest(`/api/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, parameters }),
    signal,
    timeoutMs: action === "stl" ? EXPORT_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
  });
}

// The generator's own reading of a settings set. A shared link, a loaded
// file and a saved preset all pass through here before they drive the
// sliders, so one saved before a control changed still opens cleanly.
export async function validate(
  kind: Kind,
  parameters: Parameters,
): Promise<Parameters> {
  const response = await post(kind, "validate", parameters);
  return ((await response.json()) as { parameters: Parameters }).parameters;
}

// The settings-file version each generator writes (design_document).
const DESIGN_VERSIONS: Record<Kind, number> = {
  crimp: 1,
  sloper: 1,
  jug: 2,
  foot: 2,
  pocket: 1,
  pinch: 1,
};
// Settings that older files leave out, with the value that keeps the saved
// shape as it was: crimps saved before the count control had two screws
// and chose their seat by hand; slopers saved before the lift control had
// none.
const OLDER_FILE_DEFAULTS: Partial<Record<Kind, Parameters>> = {
  crimp: { screw_count: 2, auto_seat: false },
  sloper: { incut: 0 },
};

export function parseDesignFile(text: string, kind: Kind): Parameters {
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
    throw new Error(`This is not a ${KIND_LABELS[kind]} Lab settings file.`);
  return { ...OLDER_FILE_DEFAULTS[kind], ...design.parameters };
}
