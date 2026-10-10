import {
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { prepareStlGeometry } from "./stl-geometry";
import {
  getStlViewFrame,
  getStlViewDirection,
  fitStlCamera,
} from "./stl-orientation";
import type { StlView } from "./stl-views";

// Render once to an image. Browsing cards don't keep WebGL contexts or animation loops alive.
export function renderStlThumbnail(
  data: ArrayBuffer,
  view: StlView = "side",
): string {
  const geometry = prepareStlGeometry(data);
  const material = new MeshStandardMaterial({
    color: "#9aa883",
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
    const frame = getStlViewFrame(geometry);
    const direction = getStlViewDirection(frame, view);
    const fill = new HemisphereLight(0xffffff, 0x656d56, 2);
    fill.position.copy(frame.up);
    scene.add(fill);
    const light = new DirectionalLight(0xffffff, 3);
    light.position
      .copy(direction)
      .multiplyScalar(4)
      .addScaledVector(frame.up, 3);
    scene.add(light);
    const aspect = 4 / 3;
    const { target, halfHeight } = fitStlCamera(
      geometry,
      direction,
      frame.up,
      aspect,
    );
    const camera = new OrthographicCamera(
      -halfHeight * aspect,
      halfHeight * aspect,
      halfHeight,
      -halfHeight,
      0.01,
      20,
    );
    camera.up.copy(frame.up);
    camera.position.copy(direction).multiplyScalar(3.6).add(target);
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
