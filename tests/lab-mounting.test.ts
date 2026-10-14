import assert from "node:assert/strict";
import test from "node:test";
import { mountingControlVisible } from "../src/features/hold-lab/mounting";

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
    mountingControlVisible("shank_diameter", { bolt_mount: true }),
    true,
  );
  assert.equal(
    mountingControlVisible("screw_count", { bolt_mount: false }),
    true,
  );
});
