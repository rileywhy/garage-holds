// Where the four labs differ. Everything else about them is one shell,
// hold-lab.tsx: the same generator contract, controls, presets, links,
// viewer and export.
import { VIEW_ORDER, type ViewName } from "@/features/model-viewer/viewer";
import { LAB_COPY, withInches } from "@/features/labs/conventions";
import type { Control, Kind, Parameters, Preview } from "./api";

export interface LabKind {
  // The hold's colour in the viewer, so the labs read as different tools;
  // the print-coloured default when unset.
  color?: number;
  // Keep the flat back out of the curved surface's shading. A sloper can
  // meet its back at a shallow angle; a crimp's back is a clean crease.
  separateBack: boolean;
  // The viewer's angles. The sloper's angled side shows nothing its side
  // view does not.
  views: ViewName[];
  // A new seed starts with at least this much character, so it shows.
  character: number;
  seedHint: string;
  // The crimp generator refuses a typed value outside a slider's range
  // where the other three snap it, so the Crimp Lab snaps typed values
  // itself and a stray keystroke never fails a preview.
  clampTyped: boolean;
}

const rounded = {
  separateBack: true,
  character: 0.65,
  seedHint: "Different rounded surfaces. Reset returns to the clean default.",
  clampTyped: false,
};

export const LAB_KINDS: Record<Kind, LabKind> = {
  crimp: {
    separateBack: false,
    views: VIEW_ORDER,
    character: 1.4,
    seedHint:
      "Seeds create different body folds. Changing the seed starts with visible character; dial it down for a subtler shape, or reset for the clean default.",
    clampTyped: true,
  },
  sloper: {
    ...rounded,
    views: VIEW_ORDER.filter((view) => view !== "angled-side"),
  },
  jug: { ...rounded, color: 0xc2aadf, views: VIEW_ORDER },
  foot: { ...rounded, color: 0xa9c4ae, views: VIEW_ORDER },
};

// What a preview does to the lab once it lands: the settings the sliders
// show, whether the starting-point menu drops to Custom, and what the
// status line says. The generator may have changed a setting to make the
// shape work; the sliders follow, and this preview already shows the result.
export interface Outcome {
  parameters: Parameters;
  custom: boolean;
  text: string;
}

export function followPreview(
  kind: Kind,
  previous: Parameters,
  data: Preview,
  controls: Control[],
): Outcome {
  if (kind === "crimp") return followCrimpPreview(previous, data);
  // The generator returns the settings as built, and the sliders show them.
  // The jug reports the body height it built scaled back by its size
  // factor; the slider keeps the person's own value so that size does not
  // move it.
  const parameters = {
    ...(data.parameters ?? previous),
    ...(kind === "jug" ? { body_height: previous.body_height } : {}),
  };
  // The generator only lists settings it had to change against what was
  // asked for, so a fresh preset reads as current, not adjusted.
  const notes = Object.entries(data.adjusted).map(([key, value]) => {
    const control = controls.find((c) => c.key === key);
    const amount = typeof value === "number" ? Number(value.toFixed(2)) : value;
    const unit = control?.unit === "°" ? "°" : ` ${control?.unit ?? ""}`;
    return `${control?.label ?? key} ${amount}${unit}`.trimEnd();
  });
  return {
    parameters,
    custom: false,
    text: notes.length ? LAB_COPY.adjusted(notes) : LAB_COPY.current,
  };
}

// The crimp generator reports its fitted values beside the settings rather
// than a complete set, so the sliders take them one by one: whatever it
// adjusted, the span it fitted while auto spacing is on, the seat it chose
// while auto seat is on, and the seat it built with.
function followCrimpPreview(previous: Parameters, data: Preview): Outcome {
  const built = data.design.parameters;
  const next: Parameters = {
    ...previous,
    ...data.adjusted,
    ...(previous.auto_spacing && data.screw_spacing != null
      ? { screw_spacing: data.screw_spacing }
      : {}),
    ...(previous.auto_seat && data.seat_depth != null
      ? { seat_depth: data.seat_depth }
      : {}),
    ...(typeof built.seat_depth === "number"
      ? { seat_depth: built.seat_depth }
      : {}),
  };
  // The sliders follow every fitted value, but the menu only drops to
  // Custom when something other than an automatic value moved: the fitted
  // span and seat are results of the preset, not edits.
  const derived = new Set([
    ...(previous.auto_spacing ? ["screw_spacing"] : []),
    ...(previous.auto_seat ? ["seat_depth"] : []),
  ]);
  const moved = Object.keys(next).filter((key) => next[key] !== previous[key]);
  const notes: string[] = [];
  if (data.adjusted.body_height !== undefined)
    notes.push(
      `Body height raised to ${data.adjusted.body_height} mm so the screws fit.`,
    );
  if (data.adjusted.seat_depth !== undefined)
    notes.push(
      `Seat lowered to ${Number(data.adjusted.seat_depth.toFixed(1))} mm so the screw recesses stay inside the body.`,
    );
  if (data.lip_radius != null && data.lip_radius < Number(built.lip_radius))
    notes.push(
      `The edge only has room for ${data.lip_radius} mm of lip rounding; deepen the edge or raise the body for more.`,
    );
  return {
    parameters: moved.length ? next : previous,
    custom: moved.some((key) => !derived.has(key)),
    text: notes.length
      ? `Preview is current. ${notes.join(" ")}`
      : LAB_COPY.current,
  };
}

// The numbers under "Your model", in the order each lab shows them.
export interface Metric {
  label: string;
  value: string;
}

export function modelMetrics(kind: Kind, data: Preview): Metric[] {
  const rows: Metric[] = [
    { label: "Dimensions", value: withInches(data.dimensions) },
    {
      label: "Estimated material",
      value: `≈ ${data.material_grams.join("–")} g`,
    },
    {
      label: "Mesh",
      value: `${data.triangles.toLocaleString()} triangles · closed`,
    },
  ];
  if (kind === "crimp" && data.screws.length)
    rows.push({
      label: "Screw seat",
      value: `${data.seat_depth} mm above the wall`,
    });
  rows.push({ label: "Screw holes", value: String(data.screws.length) });
  if (data.bolts?.length)
    rows.push({ label: "Bolt holes", value: String(data.bolts.length) });
  if (kind !== "crimp")
    rows.push({
      label: "Seat above wall",
      value: `${data.parameters?.seat_depth} mm`,
    });
  else if (data.screw_spacing != null)
    rows.push({
      label: "Centre spacing",
      value: `${data.screw_spacing} mm across width`,
    });
  return rows;
}
