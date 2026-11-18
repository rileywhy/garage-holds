import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  loadPlywood,
  plywoodMaterial,
} from "@/features/model-viewer/board-preview";
import type { Analysis } from "./api";
import { HOLD_COLOUR, diverging, ramp, stressScale } from "./colours";

// The force lab's 3D view: the hold on a wall tilted to its angle, each
// screw coloured by how close it is to failing, the pull drawn as an arrow
// from the fingers, and the contact pressure under the back. Geometry
// arrives in hold coordinates: X across, Y up the wall, Z out of it.

export type Mode = "stress" | "use" | "pressure";
export type View = "three" | "side" | "front" | "back";
// A cut-away: across the hold at x (its side profile), or one print layer
// at height z. The hold is clipped there and the stress inside is drawn on
// the cut face.
export type Cut = { axis: "x" | "z"; value: number } | null;

// One plywood image covers this much wall: a hole every 200 mm, as a gym
// drills it (docs/plywood-images.md).
const TILE_MM = 200;
const PLYWOOD = new Set(["plywood_18", "plywood_12"]);

export class ForceScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 1, 6000);
  private controls: OrbitControls;
  private tilt = new THREE.Group();
  private holdMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.68,
    side: THREE.DoubleSide,
  });
  private hold = new THREE.Mesh(new THREE.BufferGeometry(), this.holdMaterial);
  private board: THREE.Mesh;
  private boardMaterial: THREE.MeshStandardMaterial;
  private plainBoard = new THREE.MeshStandardMaterial({ roughness: 0.92 });
  private plywood: THREE.MeshStandardMaterial;
  private screws = new THREE.Group();
  private pressureCanvas = document.createElement("canvas");
  private pressureTexture = new THREE.CanvasTexture(this.pressureCanvas);
  private pressurePlane: THREE.Mesh;
  private arrowMaterial = new THREE.MeshBasicMaterial({ color: 0x65508f });
  private shaft: THREE.Mesh;
  private head: THREE.Mesh;
  private dot: THREE.Mesh;
  private floor = new THREE.GridHelper(1600, 32);
  private resizeObserver: ResizeObserver;
  private result: Analysis | null = null;
  private mode: Mode = "stress";
  private xray = false;
  private view: View = "three";
  private framed = false;
  private frame = 0;
  private stressScale = 1;
  private cut: Cut = null;
  private clip = new THREE.Plane();
  private sectionCanvas = document.createElement("canvas");
  private sectionTexture = new THREE.CanvasTexture(this.sectionCanvas);
  private section: THREE.Mesh;
  private peak: THREE.Group;
  private raycaster = new THREE.Raycaster();

  constructor(
    private container: HTMLElement,
    dark: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.localClippingEnabled = true;
    container.prepend(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener("change", () => this.render());
    this.controls.zoomToCursor = true;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x4a463f, 2.0));
    const key = new THREE.DirectionalLight(0xffefdb, 2.6);
    key.position.set(-120, 260, 300);
    const rim = new THREE.DirectionalLight(0xdde6ff, 1.2);
    rim.position.set(200, 100, -200);
    const fill = new THREE.DirectionalLight(0xffeadd, 0.9);
    fill.position.set(160, -120, 240);
    this.scene.add(key, rim, fill);
    this.floor.position.y = -420;
    this.scene.add(this.floor, this.tilt);

    const texture = loadPlywood("panel-front", () => this.render());
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    this.plywood = plywoodMaterial(texture);
    this.boardMaterial = this.plywood;
    this.board = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.plywood);
    this.board.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
        new THREE.LineBasicMaterial({ color: 0x78634e }),
      ),
    );
    this.tilt.add(this.hold, this.board, this.screws);

    this.pressureTexture.colorSpace = THREE.SRGBColorSpace;
    this.pressurePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.pressureTexture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.pressurePlane.renderOrder = 2;
    this.shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 1, 14),
      this.arrowMaterial,
    );
    this.head = new THREE.Mesh(
      new THREE.ConeGeometry(5.5, 16, 20),
      this.arrowMaterial,
    );
    this.dot = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 20, 12),
      this.arrowMaterial,
    );
    this.tilt.add(this.pressurePlane, this.shaft, this.head, this.dot);

    this.sectionTexture.colorSpace = THREE.SRGBColorSpace;
    this.sectionTexture.magFilter = THREE.NearestFilter;
    const quad = new THREE.BufferGeometry();
    quad.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(12), 3),
    );
    quad.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
    );
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    this.section = new THREE.Mesh(
      quad,
      new THREE.MeshBasicMaterial({
        map: this.sectionTexture,
        transparent: true,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    this.section.visible = false;
    // The most stressed spot: a ring drawn through the plastic.
    const marker = new THREE.MeshBasicMaterial({
      color: 0xb3123a,
      depthTest: false,
      transparent: true,
    });
    this.peak = new THREE.Group();
    this.peak.add(
      new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 10), marker),
      new THREE.Mesh(new THREE.TorusGeometry(6, 0.8, 8, 32), marker),
    );
    for (const part of this.peak.children) part.renderOrder = 10;
    this.peak.visible = false;
    this.tilt.add(this.section, this.peak);

    this.setTheme(dark);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  setTheme(dark: boolean) {
    this.renderer.setClearColor(dark ? 0x242628 : 0xe4e4df);
    this.arrowMaterial.color.set(dark ? 0xb5a3df : 0x65508f);
    const grid = this.floor.material as THREE.LineBasicMaterial;
    grid.color.set(dark ? 0x3b3947 : 0xc9c8bf);
    this.render();
  }

  // A new analysis. The geometry is passed only when the hold's shape
  // changed; otherwise the current mesh is recoloured.
  show(result: Analysis, geometry?: THREE.BufferGeometry) {
    this.result = result;
    if (geometry) {
      this.hold.geometry.dispose();
      this.hold.geometry = geometry;
    }
    const box = new THREE.Box3().setFromBufferAttribute(
      this.hold.geometry.getAttribute("position") as THREE.BufferAttribute,
    );
    const thickness = Math.min(result.wall.thickness, 45);
    const w = box.max.x - box.min.x + 260;
    const h = box.max.y - box.min.y + 300;
    this.board.scale.set(w, h, thickness);
    this.board.position.set(
      0,
      (box.max.y + box.min.y) / 2,
      -thickness / 2 - 0.05,
    );
    if (PLYWOOD.has(result.wall.key)) {
      this.boardMaterial = this.plywood;
      this.plywood.map?.repeat.set(w / TILE_MM, h / TILE_MM);
    } else {
      this.boardMaterial = this.plainBoard;
      this.plainBoard.color.set(result.wall.colour);
    }
    this.board.material = this.boardMaterial;

    this.drawScrews(result);
    this.drawPressure(result);
    this.drawArrow(result);
    this.tilt.rotation.x = THREE.MathUtils.degToRad(result.load.wall_angle);
    this.tilt.updateMatrixWorld(true);
    this.colour();
    if (!this.framed) {
      this.framed = true;
      this.setView(this.view);
    }
    this.render();
  }

  // The next hold shown is framed afresh (a different preset).
  refit() {
    this.framed = false;
  }

  setMode(mode: Mode, xray: boolean) {
    this.mode = mode;
    this.xray = xray;
    this.colour();
    this.render();
  }

  // The scale the stress colours were drawn at, MPa either way of zero.
  get stressRange() {
    return this.stressScale;
  }

  setCut(cut: Cut) {
    this.cut = cut;
    this.colour();
    this.render();
  }

  // The spot on the hold under a pointer position, in hold coordinates.
  pick(clientX: number, clientY: number): [number, number, number] | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.hold, false)[0];
    if (!hit) return null;
    const local = this.tilt.worldToLocal(hit.point.clone());
    return [local.x, local.y, local.z];
  }

  setView(view: View) {
    this.view = view;
    const box = new THREE.Box3().setFromObject(this.hold);
    if (box.isEmpty()) return;
    const target = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length() || 200;
    const d = size * 1.4 * Math.max(1, 1.4 / this.camera.aspect);
    const along = (x: number, y: number, z: number) =>
      new THREE.Vector3(x, y, z).applyQuaternion(this.tilt.quaternion);
    const offset =
      view === "side"
        ? new THREE.Vector3(d, 0, 0)
        : view === "front"
          ? along(0, 0, d)
          : view === "back"
            ? along(0.0001, 0, -d)
            : along(0.75, 0.25, 0.9).normalize().multiplyScalar(d);
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(offset);
    this.camera.up.set(0, 1, 0);
    this.controls.update();
    this.render();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.scene.traverse((part) => {
      if (part instanceof THREE.Mesh || part instanceof THREE.LineSegments) {
        part.geometry.dispose();
        for (const m of [part.material].flat()) {
          (m as THREE.MeshStandardMaterial).map?.dispose();
          m.dispose();
        }
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private drawScrews(result: Analysis) {
    for (const child of this.screws.children) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.screws.clear();
    for (const f of result.fasteners) {
      const below = Math.min(
        f.kind === "bolt" ? result.wall.thickness : f.thread,
        45,
      );
      const length = f.seat + below;
      const material = new THREE.MeshStandardMaterial({
        color: ramp(f.governing),
        roughness: 0.4,
        metalness: 0.5,
      });
      const r = f.shank / 2;
      const shank = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r * 0.8, length, 18),
        material,
      );
      shank.rotation.x = Math.PI / 2;
      shank.position.set(f.x, f.y, f.seat - length / 2);
      const head = new THREE.Mesh(
        new THREE.CylinderGeometry(f.head / 2, f.head / 2.4, 3.2, 24),
        material.clone(),
      );
      head.rotation.x = Math.PI / 2;
      head.position.set(f.x, f.y, f.seat + 1.6);
      this.screws.add(shank, head);
    }
  }

  private drawPressure(result: Analysis) {
    const p = result.pressure;
    this.pressureCanvas.width = p.nx;
    this.pressureCanvas.height = p.ny;
    const context = this.pressureCanvas.getContext("2d");
    if (!context) return;
    const image = context.createImageData(p.nx, p.ny);
    const c = new THREE.Color();
    for (let j = 0; j < p.ny; j++) {
      for (let i = 0; i < p.nx; i++) {
        const v = p.values[j * p.nx + i];
        const k = ((p.ny - 1 - j) * p.nx + i) * 4;
        if (v < 0) continue;
        if (v === 0) {
          image.data.set([200, 200, 210, 80], k);
        } else {
          // Canvas pixels are sRGB; three's colours are linear.
          ramp(v / result.wall.crush, c).convertLinearToSRGB();
          image.data.set([c.r * 255, c.g * 255, c.b * 255, 240], k);
        }
      }
    }
    context.putImageData(image, 0, 0);
    this.pressureTexture.needsUpdate = true;
    this.pressurePlane.scale.set(p.nx * p.step, p.ny * p.step, 1);
    this.pressurePlane.position.set(
      p.x0 - p.step / 2 + (p.nx * p.step) / 2,
      p.y0 - p.step / 2 + (p.ny * p.step) / 2,
      0.5,
    );
  }

  // The back's contact map as an image, for the panel under the viewer.
  pressureImage() {
    return this.pressureCanvas.toDataURL();
  }

  private drawArrow(result: Analysis) {
    const L = result.load;
    const dir = new THREE.Vector3(...L.direction);
    const origin = new THREE.Vector3(...L.point);
    const length = 35 + Math.min(L.force, 5000) * 0.035;
    const up = new THREE.Vector3(0, 1, 0);
    this.shaft.scale.set(1, length - 16, 1);
    this.shaft.position.copy(origin).addScaledVector(dir, (length - 16) / 2);
    this.shaft.quaternion.setFromUnitVectors(up, dir);
    this.head.position.copy(origin).addScaledVector(dir, length - 8);
    this.head.quaternion.setFromUnitVectors(up, dir);
    this.dot.position.copy(origin);
    this.shaft.visible = this.head.visible = L.force > 0;
  }

  private colour() {
    const r = this.result;
    const attribute = this.hold.geometry.getAttribute("position");
    if (!r || !attribute || r.mesh.use.length !== attribute.count) return;
    const colours = new Float32Array(attribute.count * 3);
    const c = new THREE.Color();
    const scale = stressScale(r.mesh.sigma);
    this.stressScale = scale;
    for (let i = 0; i < attribute.count; i++) {
      if (this.mode === "stress") diverging(r.mesh.sigma[i] / scale, c);
      else if (this.mode === "use") ramp(r.mesh.use[i], c);
      else c.copy(HOLD_COLOUR);
      colours.set([c.r, c.g, c.b], i * 3);
    }
    this.hold.geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(colours, 3),
    );
    const see = this.xray || this.mode === "pressure";
    if (this.holdMaterial.transparent !== see)
      this.holdMaterial.needsUpdate = true;
    this.holdMaterial.transparent = see;
    this.holdMaterial.opacity = see ? 0.35 : 1;
    this.holdMaterial.depthWrite = !see;
    this.pressurePlane.visible = see;
    this.drawSection();
    const peak = r.summary.peak;
    this.peak.visible = this.mode !== "pressure" && peak.use > 0;
    this.peak.position.set(...peak.point);
  }

  // The cut face: the stress in each brick the cut passes through.
  private drawSection() {
    const grid = this.result?.grid;
    if (!this.cut || !grid) {
      this.section.visible = false;
      this.holdMaterial.clippingPlanes = [];
      return;
    }
    const [nx, ny, nz] = grid.shape;
    const [ox, oy, oz] = grid.origin;
    const h = grid.h;
    const x = this.cut.axis === "x";
    const level = Math.floor((this.cut.value - (x ? ox : oz)) / h);
    const slab = Math.min(Math.max(level, 0), (x ? nx : nz) - 1);
    const width = x ? ny : nx;
    const height = x ? nz : ny;
    this.sectionCanvas.width = width;
    this.sectionCanvas.height = height;
    const context = this.sectionCanvas.getContext("2d");
    if (!context) return;
    const image = context.createImageData(width, height);
    const c = new THREE.Color();
    for (let e = 0; e < grid.index.length; e++) {
      const flat = grid.index[e];
      const k = flat % nz;
      const j = Math.floor(flat / nz) % ny;
      const i = Math.floor(flat / (nz * ny));
      if ((x ? i : k) !== slab) continue;
      const u = x ? j : i;
      const v = x ? k : j;
      if (this.mode === "use") ramp(grid.use[e], c);
      else diverging(grid.sigma[e] / this.stressScale, c);
      // Canvas pixels are sRGB; three's colours are linear.
      c.convertLinearToSRGB();
      image.data.set(
        [c.r * 255, c.g * 255, c.b * 255, 255],
        ((height - 1 - v) * width + u) * 4,
      );
    }
    context.putImageData(image, 0, 0);
    this.sectionTexture.needsUpdate = true;
    const value = this.cut.value;
    const corners = x
      ? [
          [value, oy, oz],
          [value, oy + ny * h, oz],
          [value, oy + ny * h, oz + nz * h],
          [value, oy, oz + nz * h],
        ]
      : [
          [ox, oy, value],
          [ox + nx * h, oy, value],
          [ox + nx * h, oy + ny * h, value],
          [ox, oy + ny * h, value],
        ];
    const position = this.section.geometry.getAttribute("position");
    corners.forEach((p, n) => position.setXYZ(n, p[0], p[1], p[2]));
    position.needsUpdate = true;
    this.section.geometry.computeBoundingSphere();
    this.section.visible = true;
    // Keep the part of the hold on the near side of the cut.
    this.clip
      .set(new THREE.Vector3(x ? -1 : 0, 0, x ? 0 : -1), value)
      .applyMatrix4(this.tilt.matrixWorld);
    this.holdMaterial.clippingPlanes = [this.clip];
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.render();
  }

  // Draws on the next frame, at most once per frame.
  private render() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      // See the back through the board when the camera is behind the wall.
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(
        this.tilt.quaternion,
      );
      const behind =
        this.camera.position.clone().sub(this.controls.target).dot(normal) < 0;
      const see = behind || this.mode === "pressure";
      for (const m of [this.plywood, this.plainBoard]) {
        if (m.transparent !== see) m.needsUpdate = true;
        m.transparent = see;
        m.opacity = see ? (behind ? 0.18 : 0.3) : 1;
        m.depthWrite = !see;
      }
      this.renderer.render(this.scene, this.camera);
    });
  }
}

// The hold's display mesh from the analysis.
export function holdGeometry(vertices: number[], faces: number[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  return geometry;
}
