import assert from "node:assert/strict";
import test from "node:test";
import type { Control, Preview } from "../src/features/hold-lab/api";
import {
  LAB_KINDS,
  followPreview,
  modelMetrics,
} from "../src/features/hold-lab/kinds";
import { LAB_COPY } from "../src/features/labs/conventions";

// A generator's answer with only the parts the lab reads filled in, and
// the settings it built with.
function preview(
  extra: Partial<Preview> = {},
  built: Preview["design"]["parameters"] = {},
): Preview {
  return {
    vertices: [],
    faces: [],
    profile: [],
    screws: [
      [-30, 0],
      [30, 0],
    ],
    bolts: [],
    dimensions: [120, 40, 28],
    material_grams: [80, 100],
    triangles: 640,
    adjusted: {},
    design: {
      generator: "garage-holds-crimp",
      version: 1,
      units: "mm",
      parameters: built,
    },
    ...extra,
  };
}

const controls: Control[] = [
  {
    key: "body_height",
    label: "Body height",
    group: "Shape",
    min: 10,
    max: 140,
    step: 1,
    unit: "mm",
    help: "",
  },
  {
    key: "incut",
    label: "Incut",
    group: "Grip",
    min: -60,
    max: 60,
    step: 1,
    unit: "°",
    help: "",
  },
];

test("each lab keeps its own colour, views, seed character and typed-value snapping", () => {
  assert.equal(LAB_KINDS.crimp.color, undefined);
  assert.ok(LAB_KINDS.jug.color && LAB_KINDS.foot.color);
  assert.notEqual(LAB_KINDS.jug.color, LAB_KINDS.foot.color);
  assert.ok(!LAB_KINDS.sloper.views.includes("angled-side"));
  for (const kind of ["crimp", "jug", "foot"] as const)
    assert.ok(LAB_KINDS[kind].views.includes("angled-side"), kind);
  assert.equal(LAB_KINDS.sloper.views[0], "three-quarter");
  // The crimp generator refuses out-of-range values; the others snap them.
  assert.equal(LAB_KINDS.crimp.clampTyped, true);
  assert.equal(LAB_KINDS.foot.clampTyped, false);
  assert.ok(LAB_KINDS.crimp.character > LAB_KINDS.sloper.character);
  assert.equal(LAB_KINDS.crimp.separateBack, false);
  assert.equal(LAB_KINDS.sloper.separateBack, true);
  assert.notEqual(LAB_KINDS.crimp.seedHint, LAB_KINDS.jug.seedHint);
});

test("crimp: a preview that changed nothing leaves the settings and the menu alone", () => {
  const previous = {
    edge_depth: 20,
    seat_depth: 10,
    auto_seat: false,
    auto_spacing: false,
    screw_spacing: 60,
    lip_radius: 4,
  };
  const outcome = followPreview(
    "crimp",
    previous,
    preview({ seat_depth: 10, screw_spacing: 60, lip_radius: 4 }, previous),
    controls,
  );
  assert.equal(outcome.parameters, previous);
  assert.equal(outcome.custom, false);
  assert.equal(outcome.text, LAB_COPY.current);
});

test("crimp: the fitted span and seat follow the preview without dropping the preset", () => {
  const previous = {
    seat_depth: 10,
    auto_seat: true,
    auto_spacing: true,
    screw_spacing: 60,
    lip_radius: 4,
  };
  const outcome = followPreview(
    "crimp",
    previous,
    preview(
      { seat_depth: 12.5, screw_spacing: 72, lip_radius: 4 },
      { ...previous, seat_depth: 12.5, screw_spacing: 72 },
    ),
    controls,
  );
  assert.deepEqual(outcome.parameters, {
    ...previous,
    seat_depth: 12.5,
    screw_spacing: 72,
  });
  assert.equal(outcome.custom, false);
  assert.equal(outcome.text, LAB_COPY.current);
  // With fewer than two screws there is no span to follow.
  const single = followPreview(
    "crimp",
    previous,
    preview(
      { screws: [[0, 0]], screw_spacing: null, seat_depth: 10 },
      previous,
    ),
    controls,
  );
  assert.equal(single.parameters.screw_spacing, 60);
});

test("crimp: a setting the generator changed moves its slider, drops to Custom and is explained", () => {
  const previous = {
    body_height: 30,
    seat_depth: 10,
    auto_seat: false,
    auto_spacing: false,
    screw_spacing: 60,
    lip_radius: 6,
  };
  const outcome = followPreview(
    "crimp",
    previous,
    preview(
      {
        adjusted: { body_height: 40, seat_depth: 7.54 },
        seat_depth: 7.54,
        screw_spacing: 60,
        lip_radius: 3,
      },
      { ...previous, body_height: 40, seat_depth: 7.54 },
    ),
    controls,
  );
  assert.deepEqual(outcome.parameters, {
    ...previous,
    body_height: 40,
    seat_depth: 7.54,
  });
  assert.equal(outcome.custom, true);
  assert.equal(
    outcome.text,
    "Preview is current. Body height raised to 40 mm so the screws fit. Seat lowered to 7.5 mm so the screw recesses stay inside the body. The edge only has room for 3 mm of lip rounding; deepen the edge or raise the body for more.",
  );
});

test("sloper and foot: the sliders show the settings as built, with adjustments listed by name", () => {
  const previous = { width: 100, body_height: 30, incut: 10 };
  const built = { width: 100, body_height: 40, incut: 12 };
  const outcome = followPreview(
    "sloper",
    previous,
    preview({
      parameters: built,
      adjusted: { body_height: 40, incut: 12.004, mystery: 1 },
    }),
    controls,
  );
  assert.deepEqual(outcome.parameters, built);
  assert.equal(outcome.custom, false);
  assert.equal(
    outcome.text,
    "Preview is current. Adjusted to fit: Body height 40 mm; Incut 12°; mystery 1.",
  );
  assert.equal(
    followPreview("foot", previous, preview({ parameters: built }), controls)
      .text,
    LAB_COPY.current,
  );
});

test("jug: the body height slider keeps the person's value while size scales the hold", () => {
  const previous = { width: 150, body_height: 30, size: 120 };
  const built = { width: 150, body_height: 25, size: 120 };
  assert.deepEqual(
    followPreview("jug", previous, preview({ parameters: built }), controls)
      .parameters,
    { ...built, body_height: 30 },
  );
});

test("the model card lists each lab's numbers in its own order", () => {
  const crimp = modelMetrics(
    "crimp",
    preview({ seat_depth: 10.5, screw_spacing: 60, bolts: [[0, 0]] }),
  );
  assert.deepEqual(
    crimp.map((m) => m.label),
    [
      "Dimensions",
      "Estimated material",
      "Mesh",
      "Screw seat",
      "Screw holes",
      "Bolt holes",
      "Centre spacing",
    ],
  );
  assert.equal(crimp[0].value, "120 × 40 × 28 mm · 4.72 × 1.57 × 1.10 in");
  assert.equal(crimp[1].value, "≈ 80–100 g");
  assert.equal(crimp[2].value, "640 triangles · closed");
  assert.equal(crimp[3].value, "10.5 mm above the wall");
  assert.equal(crimp[4].value, "2");
  assert.equal(crimp[6].value, "60 mm across width");
  // No screws: no seat and no span to report.
  assert.deepEqual(
    modelMetrics("crimp", preview({ screws: [], screw_spacing: null })).map(
      (m) => m.label,
    ),
    ["Dimensions", "Estimated material", "Mesh", "Screw holes"],
  );
  const sloper = modelMetrics(
    "sloper",
    preview({ parameters: { seat_depth: 8 } }),
  );
  assert.deepEqual(
    sloper.map((m) => m.label),
    [
      "Dimensions",
      "Estimated material",
      "Mesh",
      "Screw holes",
      "Seat above wall",
    ],
  );
  assert.equal(sloper[4].value, "8 mm");
});

test("pocket: its own colour, every view, and a floor row under Your model", () => {
  assert.ok(LAB_KINDS.pocket.color);
  assert.notEqual(LAB_KINDS.pocket.color, LAB_KINDS.foot.color);
  assert.equal(LAB_KINDS.pocket.views.length, 6);
  assert.equal(LAB_KINDS.pocket.clampTyped, false);
  const closed = modelMetrics(
    "pocket",
    preview({ floor: 12.5, parameters: { seat_depth: 3 } }),
  );
  assert.ok(
    closed.some((r) => r.label === "Pocket floor" && r.value === "12.5 mm"),
  );
  const open = modelMetrics(
    "pocket",
    preview({ floor: 0, parameters: { seat_depth: 3 } }),
  );
  assert.ok(
    open.some(
      (r) => r.label === "Pocket floor" && r.value === "open to the wall",
    ),
  );
  const foot = modelMetrics("foot", preview({ parameters: { seat_depth: 3 } }));
  assert.ok(!foot.some((r) => r.label === "Pocket floor"));
});
