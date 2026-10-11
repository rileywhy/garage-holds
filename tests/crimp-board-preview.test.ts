import assert from "node:assert/strict";
import test from "node:test";
import { Box3, BoxGeometry, Group, Mesh, Vector3 } from "three";
import {
  BoardPanel,
  DEFAULT_BOARD_ANGLE,
  mountOnBoard,
} from "../src/features/crimp-lab/board-preview";

test("40° means overhang from vertical, with the contact face pointing down and out", () => {
  const mounted = new Group();
  const hold = new Mesh(new BoxGeometry(100, 48, 22));
  hold.position.z = 11;
  const original = Array.from(hold.geometry.getAttribute("position").array);
  mounted.add(hold);
  mountOnBoard(mounted, DEFAULT_BOARD_ANGLE);
  mounted.updateMatrixWorld(true);
  const top = new Vector3(0, 100, 0).applyMatrix4(mounted.matrixWorld);
  assert.ok(Math.abs(top.y - 76.6044) < 0.001);
  assert.ok(Math.abs(top.z - 64.2788) < 0.001);
  const outward = new Vector3(0, 0, 1).transformDirection(mounted.matrixWorld);
  assert.ok(outward.y < 0);
  assert.ok(outward.z > 0);
  assert.equal(Math.round(top.length()), 100);
  assert.deepEqual(
    Array.from(hold.geometry.getAttribute("position").array),
    original,
  );
  mountOnBoard(mounted, 0);
  mounted.updateMatrixWorld(true);
  assert.deepEqual(
    new Vector3(0, 100, 0).applyMatrix4(mounted.matrixWorld).toArray(),
    [0, 100, 0],
  );
  hold.geometry.dispose();
});

test("board face meets the hold back and enlarges to fit wide/curved holds", () => {
  const board = new BoardPanel(true);
  board.fitToHold(
    new Box3(new Vector3(-150, -50, 0), new Vector3(150, 100, 60)),
  );
  board.mesh.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(board.mesh);
  assert.equal(bounds.max.z, 0);
  assert.equal(bounds.min.z, -8);
  assert.ok(bounds.min.x < -150 && bounds.max.x > 150);
  assert.ok(bounds.min.y < -50 && bounds.max.y > 100);
  for (const angle of [-1, 71, NaN, Infinity])
    assert.throws(() => mountOnBoard(new Group(), angle), /Board angle/);
  board.dispose();
});
