import assert from "node:assert/strict";
import test from "node:test";
import {
  PRESET_LIMIT,
  deletePreset,
  isSavedValue,
  loadSavedPresets,
  presetName,
  savePreset,
  savedName,
  savedValue,
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
  savePreset("crimp", "  Comp  edge ", { edge_depth: 22 }, store, clock);
  savePreset("crimp", "Rail", { edge_depth: 30 }, store, clock);
  savePreset("jug", "Big", { width: 180 }, store, clock);
  assert.deepEqual(
    loadSavedPresets("crimp", store).map((p) => p.name),
    ["Rail", "Comp edge"],
  );
  assert.equal(loadSavedPresets("jug", store).length, 1);
  savePreset("crimp", "comp EDGE", { edge_depth: 25 }, store, clock);
  const crimp = loadSavedPresets("crimp", store);
  assert.deepEqual(
    crimp.map((p) => [p.name, p.parameters.edge_depth]),
    [
      ["comp EDGE", 25],
      ["Rail", 30],
    ],
  );
  assert.deepEqual(
    deletePreset("crimp", "Rail", store).map((p) => p.name),
    ["comp EDGE"],
  );
});

test("names are checked, the list is capped, and a full browser is reported", () => {
  assert.throws(() => presetName("   "), /Give the preset a name/);
  assert.throws(() => presetName("x".repeat(41)), /under 40 characters/);
  assert.equal(presetName("  two   words "), "two words");
  const store = fakeStore();
  for (let i = 0; i < PRESET_LIMIT; i++)
    savePreset("sloper", `p${i}`, { incut: i }, store);
  assert.throws(
    () => savePreset("sloper", "one more", { incut: 1 }, store),
    /Delete one to make room/,
  );
  // Replacing an existing name still works at the cap.
  assert.equal(
    savePreset("sloper", "p3", { incut: 99 }, store).find(
      (p) => p.name === "p3",
    )?.parameters.incut,
    99,
  );
  assert.throws(
    () => savePreset("foot", "a", { width: 1 }, fakeStore(true)),
    /would not store/,
  );
  assert.throws(
    () => savePreset("foot", "a", { width: 1 }, null),
    /cannot store/,
  );
});

test("a damaged or foreign stored value reads as no presets", () => {
  const store = fakeStore();
  store.map.set("garage-holds.presets.crimp", "{not json");
  assert.deepEqual(loadSavedPresets("crimp", store), []);
  store.map.set(
    "garage-holds.presets.crimp",
    JSON.stringify({
      version: 1,
      presets: [
        { name: "ok", parameters: { a: 1 }, savedAt: "x" },
        { name: 5, parameters: {} },
        { name: "bad", parameters: [] },
        null,
      ],
    }),
  );
  assert.deepEqual(
    loadSavedPresets("crimp", store).map((p) => p.name),
    ["ok"],
  );
  assert.deepEqual(loadSavedPresets("crimp", null), []);
});

test("menu values for saved presets are namespaced", () => {
  assert.equal(savedValue("Sloping rail"), "mine:Sloping rail");
  assert.equal(savedName("mine:Sloping rail"), "Sloping rail");
  assert.ok(isSavedValue("mine:x"));
  assert.ok(!isSavedValue("Sloping rail"));
});
