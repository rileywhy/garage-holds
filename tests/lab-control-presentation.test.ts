import assert from "node:assert/strict";
import test from "node:test";
import type { Control } from "../src/features/hold-lab/api";
import { presentControls } from "../src/features/hold-lab/control-presentation";

function control(key: string, group: Control["group"] = "Mounting"): Control {
  return {
    key,
    group,
    label: key,
    help: "Original guidance.",
    unit: "mm",
    min: 1,
    max: 99,
    step: 0.5,
  };
}

test("mounting controls follow the same order without changing the generator contract", () => {
  const raw = [
    "head_diameter",
    "seat_depth",
    "bolt_diameter",
    "screw_count",
    "shank_diameter",
  ].map((key) => control(key));
  const presented = presentControls("sloper", raw);
  assert.deepEqual(
    presented.map((c) => c.key),
    [
      "screw_count",
      "seat_depth",
      "shank_diameter",
      "head_diameter",
      "bolt_diameter",
    ],
  );
  assert.equal(presented[1].label, "Screw seat depth");
  assert.deepEqual(presented[1], { ...raw[1], label: "Screw seat depth" });
  assert.equal(raw[1].label, "seat_depth");
  assert.equal(presentControls("crack", raw)[0].label, "Screws per side");
});

test("labels distinguish grip depth, crack width and pinch span", () => {
  const width = control("width", "Grip");
  width.label = "Crack width";
  assert.equal(presentControls("crack", [width])[0].label, "Crack width");
  for (const kind of ["pinch", "roundpinch"] as const)
    assert.equal(presentControls(kind, [width])[0].label, "Pinch span");
  const jugControls = [
    control("lip_radius", "Grip"),
    control("grip_quality", "Grip"),
    control("edge_depth", "Grip"),
  ];
  assert.deepEqual(
    presentControls("jug", jugControls).map((c) => c.label),
    ["Grip depth", "Grip bite", "Lip rounding"],
  );
});
