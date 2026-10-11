import assert from "node:assert/strict";
import test from "node:test";
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  Vector3,
} from "three";
import type { Preview } from "../src/features/crimp-lab/api";
import { Viewer } from "../src/features/crimp-lab/viewer";
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

// Exercise the viewer's camera and geometry paths without creating a GPU context.
function headlessViewer() {
  const camera = new OrthographicCamera(-80, 80, 60, -60, 0.1, 2000);
  const target = new Vector3();
  const board = new BoardPanel(true);
  const model = new Group();
  model.add(board.mesh);
  const viewer = Object.assign(Object.create(Viewer.prototype), {
    camera,
    controls: { target, update() {} },
    renderer: { render() {}, setSize() {} },
    container: { clientWidth: 800, clientHeight: 600 },
    mesh: null,
    model,
    board,
    boardLight: new Object3D(),
    grid: new Object3D(),
    material: new MeshStandardMaterial(),
    aspect: 800 / 600,
    halfHeight: 60,
    view: "three-quarter",
    boardAngle: DEFAULT_BOARD_ANGLE,
  }) as Viewer;
  return { viewer, camera, target, model };
}

function preview(width: number): Preview {
  const geometry = new BoxGeometry(width, 48, 22);
  geometry.translate(0, 24, 11);
  const vertices: number[][] = [];
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++)
    vertices.push([positions.getX(i), positions.getY(i), positions.getZ(i)]);
  const faces: number[][] = [];
  const indices = geometry.getIndex()!;
  for (let i = 0; i < indices.count; i += 3)
    faces.push([indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)]);
  geometry.dispose();
  return {
    vertices,
    faces,
    profile: [],
    screws: [],
    grip_inner: [0, 0],
    grip_outer: [0, 0],
    dimensions: [width, 48, 22],
    volume_cm3: 1,
    material_grams: [1, 2],
    triangles: faces.length,
    screw_spacing: null,
    lip_radius: 5,
    watertight: true,
    design: {
      generator: "garage-holds-crimp",
      version: 1,
      units: "mm",
      parameters: {},
    },
  };
}

test("shape and board-angle edits preserve the camera's orbit, pan, and zoom", () => {
  const { viewer, camera, target, model } = headlessViewer();
  viewer.update(preview(100));
  viewer.setView("board");
  // A user has orbited, panned, and zoomed away from the default view.
  target.set(15, 35, 25);
  camera.position.set(220, 140, -80);
  camera.lookAt(target);
  camera.zoom = 2.3;
  camera.updateProjectionMatrix();
  const before = {
    position: camera.position.toArray(),
    rotation: camera.quaternion.toArray(),
    target: target.toArray(),
    projection: camera.projectionMatrix.toArray(),
  };
  viewer.update(preview(180));
  viewer.setBoardAngle(55);
  assert.deepEqual(camera.position.toArray(), before.position);
  assert.deepEqual(camera.quaternion.toArray(), before.rotation);
  assert.deepEqual(target.toArray(), before.target);
  assert.deepEqual(camera.projectionMatrix.toArray(), before.projection);
  assert.equal(camera.zoom, 2.3);
  assert.ok(Math.abs(model.rotation.x - (55 * Math.PI) / 180) < 1e-12);

  const direction = camera.position.clone().sub(target).normalize();
  viewer.update(preview(250), true); // Preset/settings changes can refit.
  assert.ok(
    camera.position.clone().sub(target).normalize().distanceTo(direction) <
      1e-12,
  );
});

test("exact board side stays side-on after shape and board-angle changes", () => {
  const { viewer, camera, target } = headlessViewer();
  viewer.update(preview(100));
  viewer.setView("board");
  viewer.setBoardSideView();
  const direction = camera.getWorldDirection(new Vector3());
  assert.ok(direction.distanceTo(new Vector3(-1, 0, 0)) < 1e-12);
  assert.equal(camera.position.y, target.y);
  assert.equal(camera.position.z, target.z);
  const rotation = camera.quaternion.toArray();
  viewer.update(preview(160));
  viewer.setBoardAngle(70);
  assert.deepEqual(camera.quaternion.toArray(), rotation);
});
