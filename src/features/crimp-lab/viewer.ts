import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Preview } from "./api";

// The interactive preview: an orthographic camera around the generated
// mesh, shown as it would sit on a print bed. Ported from the local tool.

export type ViewName =
  "three-quarter" | "side" | "angled-side" | "top" | "front";

const VIEWS: Record<ViewName, [number, number, number]> = {
  "three-quarter": [1, 0.7, 1.1],
  side: [1, 0, 0],
  "angled-side": [1, 0.04, -0.1],
  top: [0, 1, 0.001],
  front: [0, 0.2, 1],
};

export class Viewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-80, 80, 60, -60, 0.1, 2000);
  private controls: OrbitControls;
  private material: THREE.MeshStandardMaterial;
  private mesh: THREE.Mesh | null = null;
  private resizeObserver: ResizeObserver;
  private aspect = 1;
  private halfHeight = 60;
  private view: ViewName = "three-quarter";

  constructor(
    private container: HTMLElement,
    dark: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(dark ? 0x303039 : 0xeeece5);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.append(this.renderer.domElement);
    this.camera.position.set(120, 80, 130);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.addEventListener("change", () => this.render());
    this.scene.add(new THREE.HemisphereLight(0xece8ff, 0x3f3a47, 2.2));
    const key = new THREE.DirectionalLight(0xffefdb, 3.1);
    key.position.set(-60, 130, 80);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xcbc0ff, 1.8);
    rim.position.set(80, 50, -100);
    this.scene.add(rim);
    const grid = new THREE.GridHelper(
      300,
      30,
      dark ? 0x5b5469 : 0xb9b4a8,
      dark ? 0x3d3947 : 0xd8d3c7,
    );
    grid.position.y = -0.3;
    this.scene.add(grid);
    this.material = new THREE.MeshStandardMaterial({
      color: 0xc9b9a5,
      roughness: 0.68,
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  update(data: Preview, fit = false) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(data.vertices.flat(), 3),
    );
    geometry.setIndex(data.faces.flat());
    geometry.computeVertexNormals();
    // Display as on a print bed; the Python mesh and STL keep their axes.
    geometry.rotateX(-Math.PI / 2);
    const first = !this.mesh;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.mesh);
    if (first || fit) this.setView(this.view);
    this.render();
  }

  setView(view: ViewName) {
    if (!this.mesh) return;
    this.view = view;
    const box = new THREE.Box3().setFromObject(this.mesh);
    const centre = box.getCenter(new THREE.Vector3());
    const direction = new THREE.Vector3(...VIEWS[view]).normalize();
    this.camera.position.copy(centre).addScaledVector(direction, 300);
    this.controls.target.copy(centre);
    this.camera.lookAt(centre);
    this.controls.update();
    this.fit();
  }

  fit() {
    if (!this.mesh) return;
    const box = new THREE.Box3().setFromObject(this.mesh);
    const centre = box.getCenter(new THREE.Vector3());
    const direction = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize();
    this.controls.target.copy(centre);
    this.camera.position.copy(centre).addScaledVector(direction, 300);
    this.camera.lookAt(centre);
    this.halfHeight = this.framedHeight();
    this.camera.zoom = 1;
    this.resize();
    this.controls.update();
  }

  private framedHeight() {
    if (!this.mesh) return 60;
    const box = new THREE.Box3().setFromObject(this.mesh);
    const centre = box.getCenter(new THREE.Vector3());
    this.camera.updateMatrixWorld(true);
    const right = new THREE.Vector3().setFromMatrixColumn(
      this.camera.matrixWorld,
      0,
    );
    const up = new THREE.Vector3().setFromMatrixColumn(
      this.camera.matrixWorld,
      1,
    );
    let width = 0;
    let height = 0;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const point = new THREE.Vector3(x, y, z).sub(centre);
          width = Math.max(width, Math.abs(point.dot(right)));
          height = Math.max(height, Math.abs(point.dot(up)));
        }
    return Math.max(height, width / this.aspect) * 1.35 + 2;
  }

  private resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    const previousAspect = this.aspect;
    this.aspect = width / height;
    if (this.mesh && previousAspect !== this.aspect)
      this.halfHeight = this.framedHeight();
    const half = this.halfHeight;
    this.camera.left = -half * this.aspect;
    this.camera.right = half * this.aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.render();
  }

  private render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.mesh?.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
