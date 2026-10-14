import assert from "node:assert/strict";
import test from "node:test";
import { mountingControlVisible } from "../src/features/hold-lab/mounting";
import { limitControl, type Control } from "../src/features/hold-lab/api";

test("bolt mode exposes bolt hardware and fixes the anti-rotation screw count", () => {
  assert.equal(
    mountingControlVisible("bolt_diameter", { bolt_mount: false }),
    false,
  );
  assert.equal(
    mountingControlVisible("bolt_head_diameter", { bolt_mount: true }),
    true,
  );
  assert.equal(
    mountingControlVisible("screw_count", { bolt_mount: true }),
    false,
  );
  assert.equal(
    mountingControlVisible("screw_spacing", { bolt_mount: true }),
    false,
  );
  assert.equal(
    mountingControlVisible("screw_arc", { bolt_mount: true }),
    false,
  );
  assert.equal(
    mountingControlVisible("screw_arc", { bolt_mount: false }),
    true,
  );
  assert.equal(
    mountingControlVisible("shank_diameter", { bolt_mount: true }),
    true,
  );
  assert.equal(
    mountingControlVisible("screw_count", { bolt_mount: false }),
    true,
  );
});

test("every slider uses its current geometry limit when one is available", () => {
  const control: Control = {
    key: "screw_spacing",
    label: "Manual screw span",
    group: "Mounting",
    min: 6,
    max: 360,
    step: 1,
    unit: "mm",
    help: "Outer screw spacing.",
  };
  const preview = {
    control_ranges: { screw_spacing: { min: 25, max: 80 } },
  } as unknown as Parameters<typeof limitControl>[1];

  assert.equal(limitControl(control, preview).min, 25);
  assert.equal(limitControl(control, preview).max, 80);
  assert.equal(limitControl({ ...control, key: "width" }, preview).max, 360);
});
