import assert from "node:assert/strict";
import test from "node:test";
import {
  PRESET_LIMIT,
  defaultPresetName,
  deletePreset,
  isSavedValue,
  loadSavedPresets,
  presetName,
  renamePreset,
  savePreset,
  savedId,
  savedValue,
  uniqueName,
} from "../src/features/lab-presets/saved-presets";

function fakeStore(failing = false) {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failing) throw new Error("QuotaExceededError");
      map.set(key, value);
    },
    map,
  };
}

test("presets save per lab, newest first, and replace by name regardless of case", () => {
  const store = fakeStore();
  const clock = (() => {
    let t = 0;
    return () => new Date(2026, 9, 14, 12, 0, t++);
  })();
  savePreset("crimp", "Rail", "?edge_depth=20", store, clock);
  savePreset("crimp", "Edge", "?edge_depth=12", store, clock);
  savePreset("foot", "Chip", "?preset=Neutral+chip", store, clock);
  assert.deepEqual(
    loadSavedPresets("crimp", store).map((p) => [p.name, p.search]),
    [
      ["Edge", "?edge_depth=12"],
      ["Rail", "?edge_depth=20"],
    ],
  );
  savePreset("crimp", "  rail ", "?edge_depth=25", store, clock);
  assert.deepEqual(
    loadSavedPresets("crimp", store).map((p) => [p.name, p.search]),
    [
      ["rail", "?edge_depth=25"],
      ["Edge", "?edge_depth=12"],
    ],
  );
  assert.equal(loadSavedPresets("foot", store).length, 1);
});

test("rename keeps the shape, refuses a clash, and delete removes by id", () => {
  const store = fakeStore();
  savePreset("jug", "A", "?width=170", store);
  savePreset("jug", "B", "?width=180", store);
  const renamed = renamePreset("jug", "A", "Wide one", store);
  assert.deepEqual(
    renamed.map((p) => [p.id, p.name, p.search]),
    [
      ["B", "B", "?width=180"],
      ["Wide one", "Wide one", "?width=170"],
    ],
  );
  assert.throws(
    () => renamePreset("jug", "B", "wide ONE", store),
    /already have a preset/,
  );
  assert.deepEqual(
    deletePreset("jug", "B", store).map((p) => p.name),
    ["Wide one"],
  );
});

test("names are trimmed, required and capped; the limit and a full store are explained", () => {
  assert.equal(presetName("  My   edge "), "My edge");
  assert.throws(() => presetName("   "), /Give the preset a name/);
  assert.throws(() => presetName("x".repeat(41)), /under 40 characters/);
  const store = fakeStore();
  for (let i = 0; i < PRESET_LIMIT; i++)
    savePreset("sloper", `p${i}`, "", store);
  assert.throws(
    () => savePreset("sloper", "one more", "", store),
    /Delete one/,
  );
  assert.throws(
    () => savePreset("sloper", "x", "", fakeStore(true)),
    /would not store/,
  );
  assert.throws(() => savePreset("sloper", "x", "", null), /cannot store/);
});

test("menu values for saved presets are marked and unmarked", () => {
  assert.equal(savedValue("Rail"), "mine:Rail");
  assert.ok(isSavedValue("mine:Rail"));
  assert.ok(!isSavedValue("Rail"));
  assert.equal(savedId("mine:Rail"), "Rail");
});

test("a default name comes from the settings that describe the shape", () => {
  assert.equal(
    defaultPresetName("crimp", { edge_depth: 22, incut: 10.5 }),
    "22 mm edge · 10.5° incut",
  );
  assert.equal(
    defaultPresetName("sloper", { width: 165, incut: 12 }),
    "165 mm wide · 12° lift",
  );
  assert.equal(
    defaultPresetName("jug", { width: 158, grip_quality: 90 }),
    "158 mm jug · 90% bite",
  );
  assert.equal(
    defaultPresetName("foot", { shape: "rock", edge_depth: 24, incut: 25 }),
    "Rock tooth · 24 mm toe · 25° bite",
  );
  assert.equal(
    defaultPresetName("custom-shape", { scale: 200, depth: 30 }),
    "200 mm wide · 30 mm deep",
  );
  assert.equal(defaultPresetName("crimp", {}), "Saved shape");
});

test("a taken name gets a number", () => {
  assert.equal(uniqueName("Edge", []), "Edge");
  assert.equal(uniqueName("Edge", ["edge"]), "Edge 2");
  assert.equal(uniqueName("Edge", ["Edge", "Edge 2"]), "Edge 3");
});
