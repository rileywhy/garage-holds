import assert from "node:assert/strict";
import test from "node:test";
import { parseDesignFile } from "../src/features/hold-lab/api";

test("Jug Lab round-trips calibrated settings and rejects other lab versions", () => {
  const design = {
    generator: "garage-holds-jug",
    version: 2,
    units: "mm",
    parameters: { size: 110, grip_quality: 65, arc_rise: 12 },
  };
  assert.deepEqual(
    parseDesignFile(JSON.stringify(design), "jug"),
    design.parameters,
  );
  for (const wrong of [
    { ...design, version: 1 },
    { ...design, generator: "garage-holds-sloper" },
    { ...design, units: "in" },
    { ...design, parameters: [] },
  ]) {
    assert.throws(
      () => parseDesignFile(JSON.stringify(wrong), "jug"),
      /Jug Lab settings file/,
    );
  }
  assert.throws(
    () => parseDesignFile(JSON.stringify(design), "sloper"),
    /Sloper Lab settings file/,
  );
});
