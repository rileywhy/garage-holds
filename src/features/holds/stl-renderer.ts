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

// Render once to an image. Browsing cards don't keep WebGL contexts or animation loops alive.
export function renderStlThumbnail(
  data: ArrayBuffer,
  orientation: Orientation,
  color: string,
): string {
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
    renderer.setSize(640, 480);
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
    const aspect = 4 / 3;
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
    return (renderer.domElement as HTMLCanvasElement).toDataURL("image/png");
  } finally {
    geometry.dispose();
    material.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
