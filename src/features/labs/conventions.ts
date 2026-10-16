// What every lab does the same way, so the five read as one tool: the wait
// before a preview, the words in the status line, the export filenames and
// the way sizes are shown.

export const PREVIEW_DEBOUNCE_MS = 200;

export const LAB_COPY = {
  starting: "Starting the generator…",
  firstPreview:
    "Starting the generator… the first preview can take a few seconds while it wakes up.",
  updating: "Updating preview…",
  current: "Preview is current. Export builds a finer version of this shape.",
  adjusted: (notes: string[]) =>
    `Preview is current. Adjusted to fit: ${notes.join("; ")}.`,
  lastValid: " Showing the last valid model.",
  building: "Building a fine STL…",
  exported:
    "STL downloaded. Save settings or copy a link to come back to this shape.",
  linkCopied: "Link copied. Anyone who opens it gets this exact shape.",
  clipboard:
    "Could not reach the clipboard. Copy the address from the address bar instead.",
  presetSaved: (name: string) =>
    `Saved as “${name}”. Presets live in this browser; Copy link or Save settings takes a shape elsewhere.`,
  presetDeleted: (name: string) => `Deleted the preset “${name}”.`,
  noViewer:
    "The 3D preview is unavailable in this browser. The controls and STL export still work.",
  waiting: "Waiting for the first preview…",
  linkRefused: (reason: string) =>
    ` The link's settings could not be applied (${reason}), so this is the default.`,
};

// crimp-120x40x28mm.stl: the lab and the hold's size, the same everywhere.
export function labFilename(
  lab: string,
  dimensions: number[],
  extension: "stl" | "json",
) {
  const size = dimensions.map((mm) => String(Math.round(mm))).join("x");
  return `${lab}-${size}mm.${extension}`;
}

// "120 × 40 × 28 mm · 4.72 × 1.57 × 1.10 in"
export function withInches(dimensions: number[]) {
  const mm = dimensions.map((d) => String(Number(d.toFixed(1)))).join(" × ");
  const inches = dimensions.map((d) => (d / 25.4).toFixed(2)).join(" × ");
  return `${mm} mm · ${inches} in`;
}

// The bounding box of a mesh, for a lab whose generator does not report one.
export function meshExtents(vertices: number[][]): number[] {
  if (!vertices.length) return [0, 0, 0];
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const vertex of vertices)
    for (let axis = 0; axis < 3; axis++) {
      const value = vertex[axis];
      if (value < low[axis]) low[axis] = value;
      if (value > high[axis]) high[axis] = value;
    }
  return high.map((value, axis) => Number((value - low[axis]).toFixed(2)));
}
