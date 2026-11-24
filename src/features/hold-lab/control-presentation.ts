import type { Control, Kind } from "./api";

// Order the common decisions within each tab. Unlisted shape-specific
// controls retain the order in which their generator explains them.
const order: Record<Control["group"], readonly string[]> = {
  Grip: [
    "size",
    "opening_width",
    "opening_height",
    "width",
    "edge_depth",
    "depth",
    "projection",
    "pocket_depth",
    "incut",
    "grip_quality",
  ],
  Shape: [
    "size",
    "width",
    "height",
    "body_height",
    "length",
    "depth",
    "side",
    "back",
  ],
  Mounting: [
    "screw_count",
    "screw_spacing",
    "screw_arc",
    "seat_depth",
    "shank_diameter",
    "head_diameter",
    "bolt_diameter",
    "bolt_head_diameter",
  ],
};

const labels: Record<string, string> = {
  size: "Scale",
  body_height: "Body height",
  body_rounding: "Body rounding",
  end_rounding: "End rounding",
  lip_radius: "Lip rounding",
  bow: "Side-to-side curve",
  screw_count: "Screw count",
  screw_spacing: "Screw span",
  seat_depth: "Screw seat depth",
};

const labLabels: Partial<Record<Kind, Record<string, string>>> = {
  crimp: {
    width: "Width",
    incut: "Grip angle",
    taper: "Side-to-side taper",
    character: "Body folds",
  },
  jug: {
    width: "Width",
    edge_depth: "Grip depth",
    grip_quality: "Grip bite",
    taper: "Side-to-side taper",
    character: "Body folds",
    arc_rise: "Arch height",
  },
  foot: { incut: "Grip angle", taper: "Toe taper", character: "Sideways lean" },
  sloper: {
    projection: "Depth from wall",
    taper: "Side-to-side taper",
    character: "Surface variation",
  },
  pocket: {
    incut: "Incut depth",
    depth: "Body depth",
    character: "Rim variation",
  },
  pinch: {
    width: "Pinch span",
    offset: "Thumb offset",
    character: "Side variation",
  },
  roundpinch: {
    width: "Pinch span",
    offset: "Thumb offset",
    rounding: "Side rounding",
  },
  crack: { screw_count: "Screws per side", back: "Back thickness" },
};

const groupOrder: readonly Control["group"][] = ["Grip", "Shape", "Mounting"];

function rank(control: Control) {
  const keys = order[control.group];
  const index = keys.indexOf(control.key);
  return index < 0 ? keys.length : index;
}

export function presentControls(
  kind: Kind,
  controls: readonly Control[],
): Control[] {
  return controls
    .map((control) => ({
      ...control,
      label:
        labLabels[kind]?.[control.key] ?? labels[control.key] ?? control.label,
      // Preserve each lab's fitting notes and the exceptions to scaling.
      help:
        control.key === "screw_spacing"
          ? "Distance between the centres of the two outermost screws. Turn off automatic spacing to set it yourself."
          : control.help,
    }))
    .sort(
      (a, b) =>
        groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) ||
        rank(a) - rank(b),
    );
}
