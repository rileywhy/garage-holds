import assert from "node:assert/strict";
import { test } from "node:test";
import {
  binaryStlTriangles,
  createModelPreview,
  PREVIEW_TARGET_TRIANGLES,
  STL_HEADER_BYTES,
  stlNeedsPreview,
} from "../src/features/uploads/model-preview";
import {
  MAX_STL_PREVIEW_BYTES,
  MAX_STL_PREVIEW_TRIANGLES,
} from "../src/features/holds/stl-limits";
import { modelPreviewKey } from "../src/features/holds/rows";

// A binary STL header claiming `triangles` faces.
function header(triangles: number) {
  const head = new Uint8Array(STL_HEADER_BYTES);
  new DataView(head.buffer).setUint32(80, triangles, true);
  return head;
}
const sizeOf = (triangles: number) => STL_HEADER_BYTES + 50 * triangles;

test("a binary STL's triangle count is read from its header when the size agrees", () => {
  assert.equal(binaryStlTriangles(header(1000), sizeOf(1000)), 1000);
  assert.equal(binaryStlTriangles(header(1000), sizeOf(1000) + 1), null);
  assert.equal(binaryStlTriangles(new Uint8Array(10), 10), null);
});

test("a model needs a preview copy when the browser would refuse it", () => {
  const over = MAX_STL_PREVIEW_TRIANGLES + 1;
  assert.equal(stlNeedsPreview(sizeOf(1000), header(1000)), false);
  assert.equal(stlNeedsPreview(sizeOf(over), header(over)), true);
  assert.equal(
    stlNeedsPreview(MAX_STL_PREVIEW_BYTES + 1, new Uint8Array(84)),
    true,
    "an ASCII STL over the size limit",
  );
  assert.equal(stlNeedsPreview(MAX_STL_PREVIEW_BYTES, header(1)), false);
});

test("the copy is made through signed URLs and named beside the original", async () => {
  const calls: string[] = [];
  const over = MAX_STL_PREVIEW_TRIANGLES + 1;
  const deps = {
    readHead: async (key: string) => {
      calls.push(`head ${key}`);
      return header(over);
    },
    signSource: async (key: string) => `https://r2/get/${key}`,
    signTarget: async (key: string) => `https://r2/put/${key}`,
    decimate: async (request: {
      source: string;
      target: string;
      triangles: number;
    }) => {
      calls.push(
        `decimate ${request.source} -> ${request.target} @${request.triangles}`,
      );
      return { triangles: 150_000, bytes: 7_500_084 };
    },
  };
  const file = {
    object_key: "designs/d/f.stl",
    name: "pickle.stl",
    bytes: sizeOf(over),
    extension: "stl",
  };
  assert.equal(await createModelPreview(file, deps), "designs/d/f-preview.stl");
  assert.deepEqual(calls, [
    "head designs/d/f.stl",
    `decimate https://r2/get/designs/d/f.stl -> https://r2/put/designs/d/f-preview.stl @${PREVIEW_TARGET_TRIANGLES}`,
  ]);
  assert.equal(modelPreviewKey("designs/d/f.stl"), "designs/d/f-preview.stl");
  assert.equal(
    modelPreviewKey("designs/d/noext"),
    "designs/d/noext-preview.stl",
  );
});

test("small models and other formats need no copy", async () => {
  const untouched = {
    readHead: async () => header(10),
    signSource: async () => "",
    signTarget: async () => "",
    decimate: async () => {
      throw new Error("must not be called");
    },
  };
  const small = {
    object_key: "designs/d/s.stl",
    name: "s.stl",
    bytes: sizeOf(10),
    extension: "stl",
  };
  assert.equal(await createModelPreview(small, untouched), null);
  assert.equal(
    await createModelPreview(
      { ...small, extension: "3mf", bytes: 1e9 },
      untouched,
    ),
    null,
  );
});

test("an empty answer from the function is a failure, not a copy", async () => {
  const over = MAX_STL_PREVIEW_TRIANGLES + 1;
  await assert.rejects(
    createModelPreview(
      {
        object_key: "designs/d/f.stl",
        name: "f.stl",
        bytes: sizeOf(over),
        extension: "stl",
      },
      {
        readHead: async () => header(over),
        signSource: async () => "s",
        signTarget: async () => "t",
        decimate: async () => ({ triangles: 0, bytes: 0 }),
      },
    ),
    /came back empty/,
  );
});
