import * as THREE from "three";
import { OrbitControls } from "/vendor/OrbitControls.js";
import {
  mergeGeometries,
  toCreasedNormals,
} from "/vendor/BufferGeometryUtils.js";

const VIEWS = {
  "three-quarter": [1, 0.7, 1.1],
  side: [1, 0, 0],
  top: [0, 1, 0.001],
  front: [0, 0.2, 1],
  board: [1, 0.08, 0.28],
};

export class Viewer {
  constructor(container) {
    this.container = container;
    this.view = "three-quarter";
    this.boardAngle = 40;
    this.scene = new THREE.Scene();
    this.model = new THREE.Group();
    this.scene.add(this.model);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x303039);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.append(this.renderer.domElement);
    this.camera = new THREE.OrthographicCamera(-80, 80, 60, -60, 0.1, 2000);
    this.camera.position.set(120, 80, 130);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener("change", () => this.render());
    this.scene.add(new THREE.HemisphereLight(0xece8ff, 0x3f3a47, 2.2));
    for (const [colour, intensity, position] of [
      [0xffefdb, 3.1, [-60, 130, 80]],
      [0xcbc0ff, 1.8, [80, 50, -100]],
      [0xffeadd, 1.2, [80, -60, 120]],
    ]) {
      const light = new THREE.DirectionalLight(colour, intensity);
      light.position.set(...position);
      this.scene.add(light);
    }
    this.grid = new THREE.GridHelper(400, 40, 0x5b5469, 0x3d3947);
    this.grid.position.y = -0.3;
    this.scene.add(this.grid);
    this.material = new THREE.MeshStandardMaterial({
      color: 0xc9b9a5,
      roughness: 0.68,
    });
    this.board = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x82654e, roughness: 0.95 }),
    );
    this.board.visible = false;
    this.model.add(this.board);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  update(data, fit = false) {
    const back = [];
    const surface = data.faces.filter((face) => {
      if (face.every((i) => Math.abs(data.vertices[i][2]) < 1e-5)) {
        back.push(face);
        return false;
      }
      return true;
    });
    const indexed = new THREE.BufferGeometry();
    indexed.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(data.vertices.flat(), 3),
    );
    indexed.setIndex(surface.flat());
    let geometry = toCreasedNormals(indexed, Math.PI / 3);
    indexed.dispose();
    if (back.length) {
      const flat = new THREE.BufferGeometry();
      flat.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          back.flatMap((face) => face.flatMap((i) => data.vertices[i])),
          3,
        ),
      );
      flat.computeVertexNormals();
      const merged = mergeGeometries([geometry, flat]);
      geometry.dispose();
      flat.dispose();
      geometry = merged;
    }
    const first = !this.mesh;
    if (this.mesh) {
      this.model.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.model.add(this.mesh);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    this.board.scale.set(
      Math.max(180, size.x * 1.6),
      Math.max(170, size.y * 1.6),
      8,
    );
    this.board.position.set(centre.x, centre.y, -4);
    if (first) this.setView(this.view);
    else if (fit) this.fit();
    this.render();
  }

  setView(view) {
    if (!VIEWS[view]) return;
    this.view = view;
    this.board.visible = view === "board";
    this.grid.visible = view !== "board";
    this.model.rotation.set(
      view === "board"
        ? THREE.MathUtils.degToRad(this.boardAngle)
        : -Math.PI / 2,
      0,
      0,
    );
    this.pointCamera(VIEWS[view]);
  }

  setBoardAngle(angle) {
    this.boardAngle = angle;
    if (this.view === "board") {
      this.model.rotation.x = THREE.MathUtils.degToRad(angle);
      this.render();
    }
  }

  exactSide() {
    if (this.view === "board") this.pointCamera([1, 0, 0]);
  }

  pointCamera(direction) {
    if (!this.mesh) return;
    const centre = this.bounds().getCenter(new THREE.Vector3());
    this.camera.position
      .copy(centre)
      .addScaledVector(new THREE.Vector3(...direction).normalize(), 400);
    this.controls.target.copy(centre);
    this.camera.lookAt(centre);
    this.controls.update();
    this.fit();
  }

  bounds() {
    this.model.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(this.mesh);
    if (this.view === "board")
      bounds.union(new THREE.Box3().setFromObject(this.board));
    return bounds;
  }

  fit() {
    if (!this.mesh) return;
    const centre = this.bounds().getCenter(new THREE.Vector3());
    const direction = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize();
    this.controls.target.copy(centre);
    this.camera.position.copy(centre).addScaledVector(direction, 400);
    this.camera.lookAt(centre);
    this.halfHeight = this.framedHeight();
    this.camera.zoom = 1;
    this.resize();
    this.controls.update();
  }

  framedHeight() {
    const box = this.bounds();
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
    let width = 0,
      height = 0;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const point = new THREE.Vector3(x, y, z).sub(centre);
          width = Math.max(width, Math.abs(point.dot(right)));
          height = Math.max(height, Math.abs(point.dot(up)));
        }
    return Math.max(height, width / this.aspect) * 1.2 + 2;
  }

  resize() {
    const width = this.container.clientWidth,
      height = this.container.clientHeight;
    if (!width || !height) return;
    const previous = this.aspect;
    this.aspect = width / height;
    if (this.mesh && previous !== this.aspect)
      this.halfHeight = this.framedHeight();
    const half = this.halfHeight || 60;
    Object.assign(this.camera, {
      left: -half * this.aspect,
      right: half * this.aspect,
      top: half,
      bottom: -half,
    });
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.mesh?.geometry.dispose();
    this.material.dispose();
    this.board.geometry.dispose();
    this.board.material.dispose();
    this.grid.geometry.dispose();
    this.grid.material.dispose();
    this.renderer.dispose();
  }
}

function svgElement(name, attributes, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

export function drawProfile(svg, data) {
  svg.replaceChildren();
  const ys = data.profile.map(([y]) => y),
    zs = data.profile.map(([, z]) => z);
  const low = Math.min(...ys),
    high = Math.max(...ys),
    depth = Math.max(...zs);
  const scale = Math.min(330 / depth, 170 / (high - low));
  const px = (z) => 100 + z * scale,
    py = (y) => 25 + (high - y) * scale;
  const path =
    data.profile
      .map(([y, z], i) => `${i ? "L" : "M"}${px(z)},${py(y)}`)
      .join(" ") + " Z";
  svg.append(
    svgElement("path", {
      d: path,
      fill: "#61586f",
      stroke: "#c2afea",
      "stroke-width": 2,
    }),
  );
  svg.append(
    svgElement("line", {
      x1: px(0),
      x2: px(0),
      y1: py(high) - 8,
      y2: py(low) + 8,
      stroke: "#aaa6b8",
      "stroke-width": 3,
    }),
  );
  svg.append(
    svgElement(
      "text",
      {
        x: 80,
        y: 120,
        "text-anchor": "middle",
        transform: "rotate(-90 80 120)",
      },
      "wall",
    ),
  );
  svg.append(
    svgElement(
      "text",
      { x: 240, y: 222, "text-anchor": "middle" },
      `${data.parameters.incut}° lift · ${data.parameters.arc_wrap}° wrap · ${data.parameters.projection} mm depth`,
    ),
  );
}
