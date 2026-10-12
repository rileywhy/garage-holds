import assert from "node:assert/strict";
import test from "node:test";
import { Matrix4, Vector3 } from "three";
import {
  DEFAULT_ORIENTATION,
  isOrientation,
  moveOrientation,
  orientationElements,
  parseOrientation,
} from "../src/features/holds/orientation";

test("orientations are rotations of the file's axes, never mirrors or junk", () => {
  assert.ok(isOrientation(DEFAULT_ORIENTATION));
  assert.ok(isOrientation("x,-y,-z"));
  assert.ok(isOrientation("-z,y,x"));
  for (const bad of ["x,y,-z", "x,x,y", "x,y", "a,b,c", "", 42, null])
    assert.equal(isOrientation(bad), false, String(bad));
  assert.equal(parseOrientation("x,y,z,"), null);
});

test("every move is a quarter or half turn that comes back round", () => {
  const up = new Vector3(0, 1, 0);
  const out = new Vector3(0, 0, 1);
  const apply = (orientation: string, vector: Vector3) =>
    vector
      .clone()
      .applyMatrix4(
        new Matrix4().fromArray(orientationElements(orientation)).transpose(),
      )
      .toArray();
  // Flipping over puts the top at the bottom and the face into the wall.
  const flipped = moveOrientation(DEFAULT_ORIENTATION, "flip");
  assert.equal(flipped, "x,-y,-z");
  assert.deepEqual(apply(flipped, up), [0, -1, 0]);
  assert.deepEqual(apply(flipped, out), [0, 0, -1]);
  assert.equal(moveOrientation(flipped, "flip"), DEFAULT_ORIENTATION);
  // Tipping brings the top towards the climber.
  assert.deepEqual(
    apply(moveOrientation(DEFAULT_ORIENTATION, "tip"), up),
    [0, 0, 1],
  );
  // Rolling lays the right side against the wall.
  assert.deepEqual(
    apply(moveOrientation(DEFAULT_ORIENTATION, "roll"), new Vector3(1, 0, 0)),
    [0, 0, -1],
  );
  // Turning keeps the back on the wall.
  const turned = moveOrientation(DEFAULT_ORIENTATION, "turn");
  assert.deepEqual(apply(turned, out), [0, 0, 1]);
  assert.deepEqual(apply(turned, up), [1, 0, 0]);
  for (const move of ["tip", "roll", "turn"] as const) {
    let orientation = DEFAULT_ORIENTATION;
    for (let i = 0; i < 4; i++) {
      orientation = moveOrientation(orientation, move);
      assert.ok(isOrientation(orientation));
    }
    assert.equal(orientation, DEFAULT_ORIENTATION, move);
  }
  // Each sequence of moves stays a valid rotation.
  let orientation = DEFAULT_ORIENTATION;
  for (const move of ["tip", "turn", "roll", "flip", "turn", "tip"] as const) {
    orientation = moveOrientation(orientation, move);
    assert.ok(isOrientation(orientation), orientation);
  }
});
