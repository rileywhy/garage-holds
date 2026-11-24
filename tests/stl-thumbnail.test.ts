import test from "node:test";
import assert from "node:assert/strict";
import {
  tableEdgeDistance,
  thumbnailViewDirection,
} from "../src/features/holds/stl-renderer";

test("the thumbnail camera looks down steeply enough to see the table", () => {
  // Thumbnails stood the hold on a table that ran behind the camera when
  // the camera lift was lowered too far; the frame showed only the board.
  const direction = thumbnailViewDirection();
  const ahead = tableEdgeDistance(1, Math.asin(direction.z));
  assert.ok(Number.isFinite(ahead) && ahead > 0, `edge at ${ahead}`);
});

test("a camera too flat for the table is refused, not drawn wrong", () => {
  assert.throws(() => tableEdgeDistance(1, 0), RangeError);
  assert.throws(() => tableEdgeDistance(1, (5 * Math.PI) / 180), RangeError);
});
