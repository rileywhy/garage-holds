import test from "node:test";
import assert from "node:assert/strict";
import { validateFeedback } from "../src/features/feedback/validation";

test("feedback needs a real message and bounded contact details", () => {
  assert.deepEqual(
    validateFeedback({
      body: "The STL preview is upside down on /holds/x.",
      contact: "",
      page: "/holds/x",
    }),
    [],
  );
  assert.equal(
    validateFeedback({ body: "broken", contact: "", page: "" }).length,
    1,
  );
  assert.equal(
    validateFeedback({
      body: "x".repeat(2001),
      contact: "y".repeat(121),
      page: "z".repeat(301),
    }).length,
    3,
  );
});
