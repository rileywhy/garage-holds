import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  BoardPanel,
  DEFAULT_BOARD_ANGLE,
  loadBoardFaces,
  loadPlywood,
  mountOnBoard,
  plywoodMaterial,
} from "./board-preview";

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

// One arrow-key press moves the view as a short drag that way would: a turn
// of 15°, or with Shift a pan of 40 pixels.
const KEY_TURN = Math.PI / 12;
const KEY_PAN = 40;
const ARROWS: Partial<Record<string, [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

// The bench is a little larger than the board panel, in whole 10 mm squares.
const BENCH_MM = 300;
const BENCH_THICKNESS_MM = 12;

const FLOOR_DIM = 0x4a463f;
const FLOOR_BRIGHT = 0x9a948a;

// The camera sits this far from the point the view turns around.
const CAMERA_DISTANCE_MM = 300;
// Zooming toward the pointer and panning both move that point. It stays
// within this reach of the hold, so the hold cannot be lost off screen.
const PIVOT_REACH_MM = BENCH_MM / 2;
// Clipping planes far enough apart that nothing within the pivot's reach is
// ever cut, wherever the view has turned. An orthographic camera can start
// drawing behind itself.
const CLIP_MM = 2000;

export interface ViewerOptions {
  dark: boolean;
  // The hold's colour; Crimp Lab's print-coloured default when omitted.
  color?: number;
  // Light across the surface to reveal shallow texture.
  reliefLighting?: boolean;
}

export class Viewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(
    -80,
    80,
    60,
    -60,
    -CLIP_MM,
    CLIP_MM,
  );
  private controls: OrbitControls;
  private material: THREE.MeshStandardMaterial;
  private mesh: THREE.Mesh | null = null;
  private model = new THREE.Group();
  private board: BoardPanel;
  // The bench the hold lies on: a plywood offcut with a pencilled 10 mm grid.
  private grid = new THREE.Group();
  private slab: THREE.Mesh;
  private boardAngle = DEFAULT_BOARD_ANGLE;
  private fillLight = new THREE.DirectionalLight(0xffeadd, 1.2);
  // Light from the sky and, more dimly, back up off the floor.
  private skyLight = new THREE.HemisphereLight(0xffffff, FLOOR_DIM, 2.2);
  private resizeObserver: ResizeObserver;
  private aspect = 1;
  private halfHeight = 60;
  private view: ViewName = "three-quarter";
  private turning = 0;
  private disposed = false;
  // Safari's own pinch events, and whether it is sending the pinch as
  // Ctrl + wheel too (which the controls already zoom on).
  private pinchScale = 1;
  private pinchAsWheel = false;
  private onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const arrow = ARROWS[event.key];
    if (event.key === "+" || event.key === "=") this.zoom(1.25);
    else if (event.key === "-" || event.key === "_") this.zoom(0.8);
    else if (event.key === "0") this.fit();
    else if (arrow) this.nudge(arrow, event.shiftKey);
    else return;
    event.preventDefault();
  };
  // Every scroll zooms, through the controls: a mouse wheel, a trackpad's
  // two-finger scroll and its pinch. Devices cannot be told apart reliably,
  // and a wheel that turned the view instead of zooming is worse than a
  // trackpad that has to drag to turn. This only notes a pinch.
  private onWheel = (event: WheelEvent) => {
    if (event.ctrlKey) this.pinchAsWheel = true;
  };
  // Older Safari pinches only through these events, and zooms the page
  // unless they are cancelled.
  private onGesture = (event: Event) => {
    event.preventDefault();
    const scale = (event as Event & { scale: number }).scale;
    if (event.type === "gesturestart") {
      this.pinchScale = 1;
      this.pinchAsWheel = false;
    } else if (event.type === "gesturechange") {
      // On touch screens the controls handle the same pinch from its touches.
      if (!this.pinchAsWheel && navigator.maxTouchPoints === 0)
        this.zoom(scale / this.pinchScale);
      this.pinchScale = scale;
    }
  };

  constructor(
    private container: HTMLElement,
    private readonly options: ViewerOptions,
  ) {
    const { dark, reliefLighting } = options;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(dark ? 0x242628 : 0xe4e4df);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.append(this.renderer.domElement);
    this.camera.position.set(120, 80, 130);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.addEventListener("change", () => this.render());
    // The first touch ends the slow turn; the hold is then where it was left.
    this.controls.addEventListener("start", () => this.setTurning(false));
    // Wheels and pinches zoom toward the pointer, so a detail can be looked
    // at closely without panning to it first.
    this.controls.zoomToCursor = true;
    this.controls.cursorStyle = "grab";
    // The view also moves from the keyboard once the viewer has focus:
    // arrows turn (pan with Shift), + and - step in and out, 0 refits.
    // Laptops without a wheel still have a way out, alongside the buttons
    // the labs draw next to the viewer.
    this.controls.minZoom = 0.15;
    this.controls.maxZoom = 12;
    this.controls.maxTargetRadius = PIVOT_REACH_MM;
    if (!container.hasAttribute("tabindex")) container.tabIndex = 0;
    container.addEventListener("keydown", this.onKey);
    container.addEventListener("wheel", this.onWheel, {
      capture: true,
      passive: true,
    });
    container.addEventListener("gesturestart", this.onGesture);
    container.addEventListener("gesturechange", this.onGesture);
    this.scene.add(this.skyLight);
    if (reliefLighting) this.skyLight.intensity = 0.7;
    const key = new THREE.DirectionalLight(0xffefdb, 3.1);
    if (reliefLighting) key.position.set(-90, 28, 65);
    else key.position.set(-60, 130, 80);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(
      0xdde6ff,
      reliefLighting ? 0.45 : 1.8,
    );
    rim.position.set(80, 50, -100);
    this.scene.add(rim);
    // A soft fill reveals the rounded underside instead of leaving it dark
    // when the hold is lying on the print bed. Mounted holds need more fill.
    this.fillLight.position.set(80, -60, 120);
    this.scene.add(this.fillLight);
    const lines = new THREE.GridHelper(
      BENCH_MM,
      BENCH_MM / 10,
      0x4a3a26,
      0x6b5638,
    );
    const pencil = lines.material as THREE.LineBasicMaterial;
    pencil.transparent = true;
    pencil.opacity = 0.3;
    lines.position.y = -0.3;
    const edge = plywoodMaterial();
    // Box faces run +X, -X, +Y (the top), -Y, +Z, -Z.
    this.slab = new THREE.Mesh(
      new THREE.BoxGeometry(BENCH_MM, BENCH_THICKNESS_MM, BENCH_MM),
      [
        edge,
        edge,
        plywoodMaterial(loadPlywood("bench", () => this.render())),
        edge,
        edge,
        edge,
      ],
    );
    this.slab.position.y = -0.45 - BENCH_THICKNESS_MM / 2;
    this.grid.add(this.slab, lines);
    this.scene.add(this.grid);
    this.board = new BoardPanel(loadBoardFaces(() => this.render()));
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
    this.fillLight.intensity =
      view === "board" ? 1.8 : this.options.reliefLighting ? 0.28 : 1.2;
    // An overhanging board faces the floor, so more comes back up at it;
    // without that its climbing side reads as stained.
    this.skyLight.groundColor.set(view === "board" ? FLOOR_BRIGHT : FLOOR_DIM);
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
      .addScaledVector(direction.normalize(), CAMERA_DISTANCE_MM);
    this.controls.cursor.copy(centre);
    this.controls.target.copy(centre);
    this.camera.lookAt(centre);
    this.controls.update();
    this.fit();
  }

  // Turn the view as a drag of (dx, dy) pixels would, or pan it, the hold
  // following the pointer either way. The controls update and redraw.
  private move(dx: number, dy: number, pan: boolean) {
    // Both scale by the viewer's size, so a hidden viewer cannot move.
    const height = this.container.clientHeight;
    if (!height) return;
    this.setTurning(false);
    if (pan) this.controls.pan(dx, dy);
    else {
      // A drag the viewer's height is one full turn, as with the mouse.
      this.controls.rotateLeft((2 * Math.PI * dx) / height);
      this.controls.rotateUp((2 * Math.PI * dy) / height);
    }
  }

  private nudge([x, y]: [number, number], pan: boolean) {
    const step = pan
      ? KEY_PAN
      : (KEY_TURN * this.container.clientHeight) / (2 * Math.PI);
    this.move(x * step, y * step, pan);
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
    this.controls.cursor.copy(centre);
    this.controls.target.copy(centre);
    this.camera.position
      .copy(centre)
      .addScaledVector(direction, CAMERA_DISTANCE_MM);
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

  setBackgroundColor(color: string) {
    this.renderer.setClearColor(color);
    this.render();
  }

  private render() {
    // Plywood images can arrive after the viewer has closed: drawing then
    // would upload them again through a disposed renderer.
    if (this.disposed) return;
    // Seen from underneath, the bench would cover the hold's back, so only
    // its pencil lines stay. The margin keeps it in a level side view.
    this.slab.visible = this.camera.position.y - this.controls.target.y > -1;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    this.setTurning(false);
    this.container.removeEventListener("keydown", this.onKey);
    this.container.removeEventListener("wheel", this.onWheel, {
      capture: true,
    });
    this.container.removeEventListener("gesturestart", this.onGesture);
    this.container.removeEventListener("gesturechange", this.onGesture);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.mesh?.geometry.dispose();
    this.material.dispose();
    this.board.dispose();
    this.grid.traverse((part) => {
      if (!(part instanceof THREE.Mesh || part instanceof THREE.LineSegments))
        return;
      part.geometry.dispose();
      for (const material of new Set([part.material].flat())) {
        (material as THREE.MeshStandardMaterial).map?.dispose();
        material.dispose();
      }
    });
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
