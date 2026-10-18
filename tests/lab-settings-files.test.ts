import assert from "node:assert/strict";
import test from "node:test";
import { parseDesignFile } from "../src/features/hold-lab/api";

const file = (generator: string, version: number, parameters: unknown) =>
  JSON.stringify({ generator, version, units: "mm", parameters });

test("Crimp Lab reads its own files and fills in what older ones left out", () => {
  const parameters = {
    edge_depth: 22,
    incut: 35,
    screw_count: 3,
    auto_seat: true,
  };
  assert.deepEqual(
    parseDesignFile(file("garage-holds-crimp", 1, parameters), "crimp"),
    parameters,
  );
  // Saved before the count control, with exactly two holes, and before the
  // automatic seat, with a seat chosen by hand.
  assert.deepEqual(
    parseDesignFile(file("garage-holds-crimp", 1, { edge_depth: 22 }), "crimp"),
    { screw_count: 2, auto_seat: false, edge_depth: 22 },
  );
});

test("Sloper Lab settings preserve incut and restore old domes without lift", () => {
  const parameters = { width: 110, incut: 35, arc_wrap: 40 };
  assert.deepEqual(
    parseDesignFile(file("garage-holds-sloper", 1, parameters), "sloper"),
    parameters,
  );
  assert.deepEqual(
    parseDesignFile(file("garage-holds-sloper", 1, { width: 90 }), "sloper"),
    { width: 90, incut: 0 },
  );
});

test("Jug and Foot Labs round-trip their calibrated settings as they are", () => {
  const jug = { size: 110, grip_quality: 65, arc_rise: 12 };
  assert.deepEqual(
    parseDesignFile(file("garage-holds-jug", 2, jug), "jug"),
    jug,
  );
  const foot = { shape: "rock", edge_depth: 24 };
  assert.deepEqual(
    parseDesignFile(file("garage-holds-foot", 2, foot), "foot"),
    foot,
  );
});

test("each lab refuses other labs' files, other versions and malformed settings", () => {
  const crimp = {
    generator: "garage-holds-crimp",
    version: 1,
    units: "mm",
    parameters: { edge_depth: 20 },
  };
  for (const wrong of [
    null,
    {},
    { ...crimp, version: 2 },
    { ...crimp, units: "in" },
    { ...crimp, parameters: [] },
    { ...crimp, parameters: "edge_depth=20" },
    { ...crimp, generator: "garage-holds-sloper" },
  ])
    assert.throws(
      () => parseDesignFile(JSON.stringify(wrong), "crimp"),
      /This is not a Crimp Lab settings file/,
    );
  assert.throws(
    () => parseDesignFile(JSON.stringify(crimp), "sloper"),
    /Sloper Lab settings file/,
  );
  const jug = file("garage-holds-jug", 1, { size: 110 });
  assert.throws(() => parseDesignFile(jug, "jug"), /Jug Lab settings file/);
  assert.throws(() => parseDesignFile(jug, "foot"), /Foot Lab settings file/);
});

test("Pocket Lab settings files round-trip as they are", () => {
  const pocket = { opening_width: 26, through: true };
  assert.deepEqual(
    parseDesignFile(file("garage-holds-pocket", 1, pocket), "pocket"),
    pocket,
  );
  assert.throws(
    () => parseDesignFile(file("garage-holds-pocket", 1, pocket), "foot"),
    /Foot Lab settings file/,
  );
});

test("Pinch Lab settings files round-trip as they are", () => {
  const pinch = { width: 48, shape: "ridged", auto_mount: false };
  assert.deepEqual(
    parseDesignFile(file("garage-holds-pinch", 1, pinch), "pinch"),
    pinch,
  );
  assert.throws(
    () => parseDesignFile(file("garage-holds-pinch", 1, pinch), "pocket"),
    /Pocket Lab settings file/,
  );
});
