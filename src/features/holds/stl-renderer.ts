import {
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { getStlViewDirection, fitStlCamera } from "./stl-orientation";
import { holdGeometry } from "./stl-scene";
import type { Orientation } from "./orientation";

// The hold's own axes once holdGeometry has stood it up.
const HOLD_FRAME = {
  across: new Vector3(1, 0, 0),
  depth: new Vector3(0, 1, 0),
  up: new Vector3(0, 0, 1),
};

const WIDTH = 640;
const HEIGHT = 480;

// Render once to a picture. Browsing cards don't keep WebGL contexts or
// animation loops alive.
//
// The picture is a 2D canvas the frame was drawn onto, never a data URL or
// blob read back out of one: browsers that resist fingerprinting (Firefox
// with resistFingerprinting, LibreWolf, Mullvad, Tor) answer toDataURL with
// noise, and the cards showed stripes. Drawing one canvas onto another is
// not a read, so nothing is withheld.
export function renderStlThumbnail(
  data: ArrayBuffer,
  orientation: Orientation,
  color: string,
): HTMLCanvasElement {
  const geometry = holdGeometry(data, orientation);
  const material = new MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0,
    side: DoubleSide,
  });
  let renderer: WebGLRenderer | undefined;
  try {
    renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(WIDTH, HEIGHT);
    renderer.setClearColor(0x000000, 0);
    const scene = new Scene();
    scene.add(new Mesh(geometry, material));
    const direction = getStlViewDirection(HOLD_FRAME, "side");
    const fill = new HemisphereLight(0xffffff, 0x656d56, 2);
    fill.position.copy(HOLD_FRAME.up);
    scene.add(fill);
    const light = new DirectionalLight(0xffffff, 3);
    light.position
      .copy(direction)
      .multiplyScalar(4)
      .addScaledVector(HOLD_FRAME.up, 3);
    scene.add(light);
    const aspect = WIDTH / HEIGHT;
    const { target, halfHeight } = fitStlCamera(
      geometry,
      direction,
      HOLD_FRAME.up,
      aspect,
    );
    // The geometry keeps the file's units, so the camera stands off by the
    // hold's own size rather than a fixed distance.
    const reach = (geometry.boundingSphere?.radius ?? 1) * 4;
    const camera = new OrthographicCamera(
      -halfHeight * aspect,
      halfHeight * aspect,
      halfHeight,
      -halfHeight,
      0.01,
      reach * 2,
    );
    camera.up.copy(HOLD_FRAME.up);
    camera.position.copy(direction).multiplyScalar(reach).add(target);
    camera.lookAt(target);
    renderer.render(scene, camera);
    if (renderer.getContext().isContextLost())
      throw new Error("The graphics context is unavailable.");
    const picture = document.createElement("canvas");
    picture.width = WIDTH;
    picture.height = HEIGHT;
    const context = picture.getContext("2d");
    if (!context) throw new Error("The graphics context is unavailable.");
    context.drawImage(renderer.domElement, 0, 0);
    return picture;
  } finally {
    geometry.dispose();
    material.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
