import test from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_HOLDS } from "../src/features/holds/sample-data";
import {
  SPECIAL_PROCESSES,
  type Review,
  type PrintRecipe,
} from "../src/features/holds/types";
import {
  MAX_MODEL_BYTES,
  validateFiles,
  validateDesign,
  validatePhotos,
  validateReview,
  validateUpload,
} from "../src/features/holds/validation";

const photo = { name: "hold.png", type: "image/png", size: 1200 };
const model = { name: "hold.STL", type: "", size: 4000 };
const review: Review = {
  id: "review",
  holdId: "mesa-edge",
  authorId: "user",
  author: "Maker",
  rating: 4,
  text: "A useful printing experience.",
  material: "PETG",
  printSettings: "",
  postProcessing: "",
  problemGrade: 5,
  createdAt: "2026-10-10T12:00:00.000Z",
};

test("upload validation collects actionable errors and requires sharing permission without native validation", () => {
  const hold = { ...SAMPLE_HOLDS[0], description: "Nice hold." };
  const errors = validateUpload(hold, [], [], false);
  assert.ok(errors.some((error) => error.includes("description")));
  assert.ok(errors.some((error) => error.includes("model file")));
  assert.ok(errors.some((error) => error.includes("permission")));
  assert.deepEqual(validateUpload(SAMPLE_HOLDS[0], [model], [], true), []);
  assert.deepEqual(validateUpload(SAMPLE_HOLDS[0], [model], [photo], false), [
    "Confirm that you created these files or have permission to share them.",
  ]);
});

test("all sample entries satisfy domain constraints", () => {
  for (const hold of SAMPLE_HOLDS)
    assert.deepEqual(validateDesign(hold), [], hold.id);
});

test("normal recipes need no special process or texture notes; texture notes have a limit", () => {
  const recipe: PrintRecipe = {
    material: "PETG",
    specialProcess: null,
    notes: "",
    textureNotes: "",
    postProcessing: "",
  };
  for (const specialProcess of [null, ...SPECIAL_PROCESSES]) {
    assert.deepEqual(
      validateDesign({
        ...SAMPLE_HOLDS[0],
        recipes: [{ ...recipe, specialProcess }],
      }),
      [],
    );
  }
  assert.deepEqual(
    validateDesign({
      ...SAMPLE_HOLDS[0],
      recipes: [
        { ...recipe, textureNotes: "My fuzzy skin settings and notes." },
      ],
    }),
    [],
  );
  assert.match(
    validateDesign({
      ...SAMPLE_HOLDS[0],
      recipes: [{ ...recipe, textureNotes: "x".repeat(2001) }],
    }).join(" "),
    /texture notes/,
  );
  assert.match(
    validateDesign({
      ...SAMPLE_HOLDS[0],
      recipes: [
        { ...recipe, specialProcess: "FDM" as PrintRecipe["specialProcess"] },
      ],
    }).join(" "),
    /special process/,
  );
});
test("requires model files but accepts uploads without photos, including uppercase STL and STEP", () => {
  assert.deepEqual(
    validateFiles([model, { ...model, name: "hold.step" }], [photo]),
    [],
  );
  assert.deepEqual(validateFiles([model], []), []);
  assert.deepEqual(validateFiles([], []), ["Add at least one model file."]);
});
test("rejects executables, zero-byte files, oversized models and SVG photos", () => {
  assert.match(
    validateFiles([{ ...model, name: "hold.exe" }], [photo]).join(" "),
    /unsupported/,
  );
  assert.match(
    validateFiles([{ ...model, size: 0 }], [photo]).join(" "),
    /between 1 byte/,
  );
  assert.match(
    validateFiles([{ ...model, size: MAX_MODEL_BYTES + 1 }], [photo]).join(" "),
    /100 MB/,
  );
  assert.match(
    validateFiles([model], [{ ...photo, type: "image/svg+xml" }]).join(" "),
    /JPG, PNG, or WebP/,
  );
});
test("photos can be validated on their own, for adding to an existing design", () => {
  assert.deepEqual(validatePhotos([]), []);
  assert.deepEqual(validatePhotos([photo, { ...photo, name: "b.jpg" }]), []);
  assert.match(validatePhotos(Array(7).fill(photo)).join(" "), /up to 6/);
  assert.match(
    validatePhotos([{ ...photo, type: "image/gif" }]).join(" "),
    /JPG, PNG, or WebP/,
  );
  assert.match(validatePhotos([{ ...photo, size: 0 }]).join(" "), /1 byte/);
});

test("grades are optional and use V0–V1 followed by V2 through V17", () => {
  for (const problemGrade of [null, 0, 2, 5, 17]) {
    assert.deepEqual(validateDesign({ ...SAMPLE_HOLDS[0], problemGrade }), []);
    assert.deepEqual(validateReview({ ...review, problemGrade }), []);
  }
  for (const problemGrade of [-1, 1, 18, NaN, 2.5]) {
    assert.match(
      validateDesign({ ...SAMPLE_HOLDS[0], problemGrade }).join(" "),
      /grade/,
    );
    assert.match(
      validateReview({ ...review, problemGrade }).join(" "),
      /grade/,
    );
  }
});
test("reviews reject invalid ratings and empty descriptions", () => {
  assert.match(validateReview({ ...review, rating: 0 }).join(" "), /rating/);
  assert.match(validateReview({ ...review, rating: 3.5 }).join(" "), /rating/);
  assert.match(validateReview({ ...review, text: " " }).join(" "), /review/);
});
