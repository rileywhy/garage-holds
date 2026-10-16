import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BoardPanel, DEFAULT_BOARD_ANGLE, mountOnBoard } from "./board-preview";

// The interactive preview shared by Crimp Lab and the design pages: an
// orthographic camera around a hold, shown on a print bed or mounted on an
// adjustable board. Geometry arrives in hold coordinates: X across the hold,
// Y up the wall, Z out of the flat back, which sits on Z=0.

export type ViewName =
  "three-quarter" | "side" | "angled-side" | "top" | "front" | "board";

const VIEWS: Record<ViewName, [number, number, number]> = {
  "three-quarter": [1, 0.7, 1.1],
  side: [1, 0, 0],
  "angled-side": [1, 0.04, -0.1],
  top: [0, 1, 0.001],
  front: [0, 0.2, 1],
  board: [1, 0.08, 0.28],
};

// The toolbar every lab draws: the same views, in the same order, with the
// same names.
export const VIEW_ORDER: ViewName[] = [
  "three-quarter",
  "board",
  "side",
  "angled-side",
  "top",
  "front",
];
export const VIEW_LABELS: Record<ViewName, string> = {
  "three-quarter": "3D",
  board: "Board preview",
  side: "Side",
  "angled-side": "Angled side",
  top: "Above",
  front: "Front",
};

export interface ViewerOptions {
  dark: boolean;
  // The hold's colour; Crimp Lab's print-coloured default when omitted.
  color?: number;
}

export class Viewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-80, 80, 60, -60, 0.1, 2000);
  private controls: OrbitControls;
  private material: THREE.MeshStandardMaterial;
  private mesh: THREE.Mesh | null = null;
  private model = new THREE.Group();
  private board: BoardPanel;
  private grid: THREE.GridHelper;
  private boardAngle = DEFAULT_BOARD_ANGLE;
  private fillLight = new THREE.DirectionalLight(0xffeadd, 1.2);
  private resizeObserver: ResizeObserver;
  private aspect = 1;
  private halfHeight = 60;
  private view: ViewName = "three-quarter";
  private turning = 0;
  private onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "+" || event.key === "=") this.zoom(1.25);
    else if (event.key === "-" || event.key === "_") this.zoom(0.8);
    else if (event.key === "0") this.fit();
    else return;
    event.preventDefault();
  };

  constructor(
    private container: HTMLElement,
    options: ViewerOptions,
  ) {
    const { dark } = options;
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
    // The first touch ends the slow turn; the hold is then where it was left.
    this.controls.addEventListener("start", () => this.setTurning(false));
    // Zoom is also on the keyboard once the viewer has focus: + and - step
    // in and out, 0 refits. Laptops without a wheel still have a way out,
    // alongside the buttons the labs draw next to the viewer.
    this.controls.minZoom = 0.15;
    this.controls.maxZoom = 12;
    if (!container.hasAttribute("tabindex")) container.tabIndex = 0;
    container.addEventListener("keydown", this.onKey);
    this.scene.add(new THREE.HemisphereLight(0xece8ff, 0x3f3a47, 2.2));
    const key = new THREE.DirectionalLight(0xffefdb, 3.1);
    key.position.set(-60, 130, 80);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xcbc0ff, 1.8);
    rim.position.set(80, 50, -100);
    this.scene.add(rim);
    // A soft fill reveals the rounded underside instead of leaving it dark
    // when the hold is lying on the print bed. Mounted holds need more fill.
    this.fillLight.position.set(80, -60, 120);
    this.scene.add(this.fillLight);
    this.grid = new THREE.GridHelper(
      300,
      30,
      dark ? 0x5b5469 : 0xb9b4a8,
      dark ? 0x3d3947 : 0xd8d3c7,
    );
    this.grid.position.y = -0.3;
    this.scene.add(this.grid);
    this.board = new BoardPanel(dark);
    this.model.add(this.board.mesh);
    this.scene.add(this.model);
    this.material = new THREE.MeshStandardMaterial({
      color: options.color ?? 0xc9b9a5,
      roughness: 0.68,
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  // Shows a hold; the previous one's geometry is released. Replacing the
  // shape must not reset the user's orbit, pan, or zoom unless asked (fit).
  setGeometry(geometry: THREE.BufferGeometry, fit = false) {
    const first = !this.mesh;
    if (this.mesh) {
      this.model.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.model.add(this.mesh);
    geometry.computeBoundingBox();
    this.board.placeBehind(geometry.boundingBox!);
    if (first) this.setView(this.view);
    else if (fit) this.fit();
    this.render();
  }

  setView(view: ViewName) {
    this.view = view;
    this.board.mesh.visible = view === "board";
    this.fillLight.intensity = view === "board" ? 1.8 : 1.2;
    this.grid.visible = view !== "board";
    if (view === "board") mountOnBoard(this.model, this.boardAngle);
    else this.model.rotation.set(-Math.PI / 2, 0, 0);
    this.pointCamera(new THREE.Vector3(...VIEWS[view]));
  }

  // Look along the board's width, with world-up kept vertical.
  setBoardSideView() {
    if (this.view !== "board") return;
    this.pointCamera(new THREE.Vector3(1, 0, 0));
  }

  // A slow turntable, until the user takes hold of the view.
  setTurning(on: boolean) {
    if (on === this.controls.autoRotate) return;
    this.controls.autoRotate = on;
    this.controls.autoRotateSpeed = 1.2;
    cancelAnimationFrame(this.turning);
    if (!on) return;
    const step = () => {
      if (!this.controls.autoRotate) return;
      this.controls.update();
      this.turning = requestAnimationFrame(step);
    };
    this.turning = requestAnimationFrame(step);
  }

  private pointCamera(direction: THREE.Vector3) {
    if (!this.mesh) return;
    const box = this.viewBounds();
    const centre = box.getCenter(new THREE.Vector3());
    this.camera.position
      .copy(centre)
      .addScaledVector(direction.normalize(), 300);
    this.controls.target.copy(centre);
    this.camera.lookAt(centre);
    this.controls.update();
    this.fit();
  }

  // Step the view in (factor above 1) or out, within the same limits the
  // wheel and pinch gestures use.
  zoom(factor: number) {
    this.camera.zoom = Math.min(
      this.controls.maxZoom,
      Math.max(this.controls.minZoom, this.camera.zoom * factor),
    );
    this.camera.updateProjectionMatrix();
    this.render();
  }

  setBoardAngle(angle: number) {
    this.boardAngle = angle;
    if (this.view === "board") {
      mountOnBoard(this.model, angle);
      this.render();
    }
  }

  // What a fit frames: the hold, and on the board a margin of board around
  // it rather than the whole panel, so the hold stays the subject and the
  // framing does not depend on the panel's fixed size.
  private viewBounds() {
    this.model.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(this.mesh!);
    if (this.view === "board") {
      const size = bounds.getSize(new THREE.Vector3());
      bounds.expandByScalar(Math.max(30, Math.max(size.x, size.y) * 0.35));
      bounds.intersect(new THREE.Box3().setFromObject(this.board.mesh));
    }
    return bounds;
  }

  fit() {
    if (!this.mesh) return;
    const box = this.viewBounds();
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
    const box = this.viewBounds();
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
    this.setTurning(false);
    this.container.removeEventListener("keydown", this.onKey);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.mesh?.geometry.dispose();
    this.material.dispose();
    this.board.dispose();
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// The site's theme as the viewer should paint it: the toggle's choice,
// else the system's.
export function isDarkTheme() {
  const theme = document.documentElement.dataset.theme;
  return theme
    ? theme === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
}
