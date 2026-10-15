import test from "node:test";
import assert from "node:assert/strict";
import {
  designRowToHold,
  fileExtension,
  objectKey,
  photoContentType,
  reviewRowToReview,
  type DesignRow,
  photoObjectKeys,
  photoSizeKey,
} from "../src/features/holds/rows";
import { validateDesign } from "../src/features/holds/validation";
import { readDesignInput } from "../src/features/holds/design-form";

const row: DesignRow = {
  id: "0b7b8a3e-2f6e-4d2a-9c1e-1f0a2b3c4d5e",
  owner_id: "user-1",
  title: "Mesa edge",
  description: "A crisp incut edge for steep boards, tested on a 40.",
  hold_type: "Crimp",
  size: "Medium",
  mounting: "Screw-on",
  problem_grade: 5,
  tags: ["crimp", "board training"],
  license: "CC BY 4.0",
  design_method: "human-shaped",
  material: "PETG-CF",
  special_process: null,
  print_notes: "0.2 mm layers, 4 walls.",
  texture_notes: "",
  post_processing: "",
  status: "published",
  published_at: "2026-10-10T12:00:00.000Z",
  created_at: "2026-10-10T12:00:00.000Z",
  updated_at: "2026-10-10T12:00:00.000Z",
  profiles: { display_name: "rileywhy" },
  design_files: [
    {
      id: "photo-2",
      kind: "photo",
      object_key: "designs/d/photo-2.jpg",
      name: "side.jpg",
      extension: "jpg",
      bytes: 2000,
      position: 1,
      design_id: "0b7b8a3e-2f6e-4d2a-9c1e-1f0a2b3c4d5e",
      created_at: "2026-10-10T12:00:00.000Z",
      status: "ready",
      preview_object_key: null,
      orientation: "x,y,z",
    },
    {
      id: "photo-1",
      kind: "photo",
      object_key: "designs/d/photo-1.png",
      name: "front.png",
      extension: "png",
      bytes: 1000,
      position: 0,
      design_id: "0b7b8a3e-2f6e-4d2a-9c1e-1f0a2b3c4d5e",
      created_at: "2026-10-10T12:00:00.000Z",
      status: "ready",
      preview_object_key: null,
      orientation: "x,y,z",
    },
    {
      id: "model-1",
      kind: "model",
      object_key: "designs/d/model-1.stl",
      name: "mesa edge.stl",
      extension: "stl",
      bytes: 50000,
      position: 2,
      design_id: "0b7b8a3e-2f6e-4d2a-9c1e-1f0a2b3c4d5e",
      created_at: "2026-10-10T12:00:00.000Z",
      status: "ready",
      preview_object_key: null,
      orientation: "x,-y,-z",
    },
    {
      id: "model-pending",
      kind: "model",
      object_key: "designs/d/model-pending.3mf",
      name: "unfinished.3mf",
      extension: "3mf",
      bytes: 1,
      position: 3,
      design_id: "0b7b8a3e-2f6e-4d2a-9c1e-1f0a2b3c4d5e",
      created_at: "2026-10-10T12:00:00.000Z",
      status: "pending",
      preview_object_key: null,
      orientation: "x,y,z",
    },
  ],
};

test("design rows become holds with ordered, verified files only", () => {
  const urls = new Map([
    ["photo-1", "https://r2/photo-1"],
    ["model-1", "https://r2/model-1"],
  ]);
  const hold = designRowToHold(row, urls);
  assert.equal(hold.creator, "rileywhy");
  assert.equal(hold.ownerId, "user-1");
  assert.match(hold.color, /^#[0-9a-f]{6}$/);
  assert.equal(hold.files[0].orientation, "x,-y,-z");
  assert.deepEqual(
    hold.photos.map((photo) => photo.id),
    ["photo-1", "photo-2"],
  );
  assert.equal(hold.photos[0].url, "https://r2/photo-1");
  assert.equal(hold.photos[1].url, "");
  assert.deepEqual(
    hold.files.map((file) => file.id),
    ["model-1"],
  );
  assert.equal(hold.recipes[0].material, "PETG-CF");
  assert.deepEqual(validateDesign(hold), []);
});

test("a damaged orientation falls back to the file as it came", () => {
  const damaged = {
    ...row,
    design_files: row.design_files.map((file) =>
      file.id === "model-1" ? { ...file, orientation: "x,x,z" } : file,
    ),
  };
  const hold = designRowToHold(damaged, new Map());
  assert.equal(hold.files[0].orientation, "x,y,z");
  // The colour follows the design, not the request.
  assert.equal(hold.color, designRowToHold(row, new Map()).color);
});

test("missing profiles and reviews still render", () => {
  assert.equal(
    designRowToHold({ ...row, profiles: null }, new Map()).creator,
    "Unknown maker",
  );
  const review = reviewRowToReview({
    id: "r",
    design_id: row.id,
    author_id: "user-2",
    rating: 4,
    body: "Printed well in PETG.",
    material: "PETG",
    print_settings: "",
    post_processing: "",
    problem_grade: null,
    created_at: "2026-10-10T12:00:00.000Z",
    updated_at: "2026-10-10T12:00:00.000Z",
    profiles: null,
  });
  assert.equal(review.author, "Unknown maker");
  assert.equal(review.holdId, row.id);
  assert.equal(review.text, "Printed well in PETG.");
});

test("object keys never include user-supplied names", () => {
  assert.equal(objectKey("d", "f", "stl"), "designs/d/f.stl");
  assert.equal(fileExtension("My Hold.FINAL.STL"), "stl");
  assert.equal(fileExtension("weird.name.ex$e"), "");
  assert.equal(fileExtension("noextension"), "");
  assert.equal(photoContentType("jpg"), "image/jpeg");
  assert.equal(photoContentType("stl"), null);
});

test("the design form reads into a DesignInput with trimmed, deduplicated tags", () => {
  const form = new FormData();
  form.set("title", "  Mesa edge ");
  form.set(
    "description",
    "A crisp incut edge for steep boards, tested on a 40.",
  );
  form.set("type", "Crimp");
  form.set("size", "Medium");
  form.set("mount", "Screw-on");
  form.set("problemGrade", "5");
  form.set("material", "PETG-CF");
  form.set("specialProcess", "");
  form.set("printNotes", "0.2 mm layers");
  form.set("textureNotes", "");
  form.set("postProcessing", "");
  form.set("tags", "crimp, board training ,crimp,, edge");
  form.set("license", "CC BY 4.0");
  form.set("designMethod", "human-shaped");
  const input = readDesignInput(form);
  assert.equal(input.title, "Mesa edge");
  assert.equal(input.designMethod, "human-shaped");
  assert.equal(input.problemGrade, 5);
  assert.equal(input.recipes[0].specialProcess, null);
  assert.deepEqual(input.tags, ["crimp", "board training", "edge"]);
  assert.deepEqual(validateDesign(input), []);
  form.set("problemGrade", "");
  assert.equal(readDesignInput(form).problemGrade, null);
  form.delete("designMethod");
  assert.equal(readDesignInput(form).designMethod, "");
  assert.ok(
    validateDesign(readDesignInput(form)).some((error) =>
      error.includes("Human-shaped or Generated"),
    ),
  );
});

test("photo sizes live beside the original under derived keys", () => {
  assert.equal(photoSizeKey("designs/d/f.jpg", "card"), "designs/d/f-card.jpg");
  assert.equal(photoSizeKey("designs/d/f", "large"), "designs/d/f-large");
  assert.deepEqual(photoObjectKeys("designs/d.x/f.webp"), [
    "designs/d.x/f.webp",
    "designs/d.x/f-card.webp",
    "designs/d.x/f-large.webp",
  ]);
});
