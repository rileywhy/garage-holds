import test from "node:test";
import assert from "node:assert/strict";
import {
  migrateClimbingMetadata,
  migratePrintingMetadata,
} from "../src/lib/local-migrations";
import { SPECIAL_PROCESSES } from "../src/features/holds/types";

test("migration preserves uploads and removes obsolete metadata without inventing a grade", () => {
  const hold = {
    id: "local-hold",
    title: "My hold",
    size: "Medium",
    photoIds: ["photo"],
    files: [{ id: "model", name: "hold.stl" }],
    dimensions: [100, 50, 30],
    incut: "Positive",
    angleMin: 20,
    angleMax: 60,
    gradeMin: 4,
    gradeMax: 6,
    gradeAngle: 40,
  };
  assert.deepEqual(migrateClimbingMetadata(hold, "hold"), {
    id: hold.id,
    title: hold.title,
    size: hold.size,
    photoIds: hold.photoIds,
    files: hold.files,
    problemGrade: null,
  });
  assert.equal(hold.gradeMin, 4);
});

test("recipe migration clears the ordinary printing process and preserves notes, grades, and file references", () => {
  const hold = {
    id: "hold",
    problemGrade: 0,
    photoIds: ["photo"],
    files: [{ id: "stl" }],
    recipes: [
      {
        material: "PETG",
        process: "FDM",
        notes: "My print settings",
        postProcessing: "Sanding",
      },
      {
        material: "Resin",
        process: "Resin",
        notes: "Resin settings",
        postProcessing: "",
      },
      {
        material: "PLA",
        process: "Mold master",
        notes: "For casting",
        postProcessing: "",
      },
    ],
  };
  assert.deepEqual(migratePrintingMetadata(hold), {
    ...hold,
    recipes: hold.recipes.map(({ process, ...recipe }) => ({
      ...recipe,
      specialProcess:
        process === "Resin"
          ? SPECIAL_PROCESSES[1]
          : process === "Mold master"
            ? SPECIAL_PROCESSES[2]
            : null,
      textureNotes: "",
    })),
  });
  assert.equal(hold.recipes[0].process, "FDM");
});

test("migration retains unambiguous suggestions only at 40 degrees", () => {
  assert.equal(
    migrateClimbingMetadata(
      { gradeMin: 5, gradeMax: 5, gradeAngle: 40 },
      "hold",
    ).problemGrade,
    5,
  );
  assert.equal(
    migrateClimbingMetadata(
      { gradeMin: 0, gradeMax: 1, boardAngle: 40 },
      "review",
    ).problemGrade,
    0,
  );
  assert.equal(
    migrateClimbingMetadata(
      { gradeMin: 1, gradeMax: 1, boardAngle: 40 },
      "review",
    ).problemGrade,
    0,
  );
  assert.equal(
    migrateClimbingMetadata(
      { gradeMin: 5, gradeMax: 5, boardAngle: 30 },
      "review",
    ).problemGrade,
    null,
  );
  assert.equal(
    migrateClimbingMetadata({ gradeMin: null, gradeMax: null }, "hold")
      .problemGrade,
    null,
  );
  assert.deepEqual(
    migrateClimbingMetadata(
      {
        id: "review",
        text: "Keep my review",
        rating: 4,
        boardAngle: 40,
        gradeMin: 4,
        gradeMax: 6,
      },
      "review",
    ),
    {
      id: "review",
      text: "Keep my review",
      rating: 4,
      problemGrade: null,
    },
  );
});
