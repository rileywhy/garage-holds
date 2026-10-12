import test from "node:test";
import assert from "node:assert/strict";
import { filterHolds, reviewSummary } from "../src/features/holds/catalog";
import { SAMPLE_HOLDS } from "./fixtures/sample-holds";
import {
  DEFAULT_FILTERS,
  SPECIAL_PROCESSES,
  type Hold,
  type Review,
} from "../src/features/holds/types";

test("combines hold type, mounting, material, and suggested grade filters", () => {
  const matches = filterHolds(SAMPLE_HOLDS, {
    ...DEFAULT_FILTERS,
    types: ["Crimp"],
    mounts: ["Screw-on"],
    materials: ["PETG-CF"],
    targetGrade: 5,
  });
  assert.deepEqual(
    matches.map((hold) => hold.id),
    ["mesa-edge"],
  );
  assert.equal(
    filterHolds(SAMPLE_HOLDS, {
      ...DEFAULT_FILTERS,
      types: ["Crimp"],
      mounts: ["Screw-on"],
      targetGrade: 2,
    }).length,
    0,
  );
});

test("material and special process must match a single recipe", () => {
  const hold: Hold = {
    ...SAMPLE_HOLDS[0],
    recipes: [
      {
        material: "PETG",
        specialProcess: null,
        notes: "",
        textureNotes: "",
        postProcessing: "",
      },
      {
        material: "Resin",
        specialProcess: SPECIAL_PROCESSES[1],
        notes: "",
        textureNotes: "",
        postProcessing: "",
      },
    ],
  };
  assert.equal(
    filterHolds([hold], {
      ...DEFAULT_FILTERS,
      materials: ["PETG"],
      specialProcesses: [SPECIAL_PROCESSES[1]],
    }).length,
    0,
  );
  assert.equal(
    filterHolds([hold], {
      ...DEFAULT_FILTERS,
      materials: ["PETG"],
      specialProcesses: [],
    }).length,
    1,
  );
});

test("search includes fuzzy skin notes and filters exclude normal prints when a special process is selected", () => {
  const hold: Hold = {
    ...SAMPLE_HOLDS[0],
    recipes: [
      {
        ...SAMPLE_HOLDS[0].recipes[0],
        specialProcess: null,
        textureNotes:
          "Fuzzy skin in my slicer: thickness and point distance notes.",
      },
    ],
  };
  assert.equal(
    filterHolds([hold], { ...DEFAULT_FILTERS, query: "fuzzy skin" }).length,
    1,
  );
  assert.equal(
    filterHolds([hold], {
      ...DEFAULT_FILTERS,
      specialProcesses: [SPECIAL_PROCESSES[0]],
    }).length,
    0,
  );
  assert.deepEqual(
    filterHolds(SAMPLE_HOLDS, {
      ...DEFAULT_FILTERS,
      specialProcesses: [SPECIAL_PROCESSES[0]],
    }).map((hold) => hold.id),
    ["mesa-edge"],
  );
});

test("search matches creators, materials and process tags without case sensitivity", () => {
  assert.deepEqual(
    filterHolds(SAMPLE_HOLDS, {
      ...DEFAULT_FILTERS,
      query: " PETG-CF salt annealing ",
    }).map((hold) => hold.id),
    ["mesa-edge"],
  );
  assert.equal(
    filterHolds(SAMPLE_HOLDS, { ...DEFAULT_FILTERS, query: "northLINE" })
      .length,
    3,
  );
});

test("sorting does not mutate the original catalog", () => {
  const original = SAMPLE_HOLDS.map((hold) => hold.id);
  const sorted = filterHolds(SAMPLE_HOLDS, {
    ...DEFAULT_FILTERS,
    sort: "title",
  });
  assert.equal(sorted[0].id, "canyon-crimp");
  assert.deepEqual(
    SAMPLE_HOLDS.map((hold) => hold.id),
    original,
  );
});

test("grade filtering matches the single suggestion and excludes unspecified grades", () => {
  assert.ok(
    filterHolds(SAMPLE_HOLDS, {
      ...DEFAULT_FILTERS,
      targetGrade: 5,
    }).some((hold) => hold.id === "mesa-edge"),
  );
  assert.equal(
    filterHolds(SAMPLE_HOLDS, {
      ...DEFAULT_FILTERS,
      targetGrade: 4,
    }).some((hold) => hold.id === "mesa-edge"),
    false,
  );
  assert.equal(
    filterHolds(
      [
        {
          ...SAMPLE_HOLDS[0],
          problemGrade: null,
        },
      ],
      { ...DEFAULT_FILTERS, targetGrade: 4 },
    ).length,
    0,
  );
  assert.equal(
    filterHolds([{ ...SAMPLE_HOLDS[0], problemGrade: 0 }], {
      ...DEFAULT_FILTERS,
      targetGrade: 0,
    }).length,
    1,
  );
});

test("review averages include only reviews for the selected hold", () => {
  const reviews = [
    { holdId: "one", rating: 5 },
    { holdId: "one", rating: 3 },
    { holdId: "two", rating: 1 },
  ] as Review[];
  assert.deepEqual(reviewSummary(reviews, "one"), { count: 2, average: 4 });
  assert.deepEqual(reviewSummary(reviews, "missing"), {
    count: 0,
    average: null,
  });
});
