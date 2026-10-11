import * as THREE from "three";
import { OrbitControls } from "/vendor/OrbitControls.js";

const VIEWS = {
  "three-quarter": [1, 0.7, 1.1],
  side: [1, 0, 0],
  "angled-side": [1, 0.04, -0.1],
  top: [0, 1, 0.001],
  front: [0, 0.2, 1],
};

export class Viewer {
  constructor(container) {
    this.container = container;
    this.view = "three-quarter";
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x303039);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-80, 80, 60, -60, 0.1, 2000);
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
    const grid = new THREE.GridHelper(300, 30, 0x5b5469, 0x3d3947);
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

  update(data, fit = false) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(data.vertices.flat(), 3),
    );
    geometry.setIndex(data.faces.flat());
    geometry.computeVertexNormals();
    // Display as on a print bed; the Python mesh/STL keep their original axes.
    geometry.rotateX(-Math.PI / 2);
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    const first = !this.mesh;
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.mesh);
    if (first || fit) this.setView(this.view);
    this.render();
  }

  setView(view) {
    if (!this.mesh || !VIEWS[view]) return;
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

  framedHeight() {
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
    let width = 0,
      height = 0;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const point = new THREE.Vector3(x, y, z).sub(centre);
          width = Math.max(width, Math.abs(point.dot(right)));
          height = Math.max(height, Math.abs(point.dot(up)));
        }
      }
    }
    return Math.max(height, width / this.aspect) * 1.35 + 2;
  }

  resize() {
    const width = this.container.clientWidth,
      height = this.container.clientHeight;
    if (!width || !height) return;
    const previousAspect = this.aspect;
    this.aspect = width / height;
    if (this.mesh && previousAspect !== this.aspect)
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

// The lip rounds as far as the edge allows; say so when that is less than asked.
function lipRadiusLabel(data, parameters) {
  const fits = data.lip_radius;
  return fits < parameters.lip_radius
    ? `${parameters.lip_radius} mm lip radius (${fits} mm fits)`
    : `${parameters.lip_radius} mm lip radius`;
}

export function drawProfile(svg, data, parameters) {
  svg.replaceChildren();
  const ys = data.profile.map((point) => point[0]);
  const zs = data.profile.map((point) => point[1]);
  const low = Math.min(...ys) - 8,
    high = Math.max(...ys) + 15;
  const depth = Math.max(...zs) + 15;
  const scale = Math.min(350 / depth, 190 / (high - low));
  const originX = (480 - Math.max(...zs) * scale) / 2;
  const px = (z) => originX + z * scale;
  const py = (y) => 24 + (high - y) * scale;
  for (let z = 10; z < depth; z += 10) {
    svg.append(
      svgElement("line", {
        x1: px(z),
        x2: px(z),
        y1: py(high),
        y2: py(low),
        stroke: "#3c3946",
        "stroke-width": 1,
      }),
    );
  }
  const path =
    data.profile
      .map(([y, z], index) => `${index ? "L" : "M"}${px(z)},${py(y)}`)
      .join(" ") + " Z";
  svg.append(
    svgElement("path", {
      d: path,
      fill: "#61586f",
      stroke: "#c2afea",
      "stroke-width": 2,
      "stroke-linejoin": "round",
    }),
  );
  svg.append(
    svgElement("line", {
      x1: px(0),
      x2: px(0),
      y1: py(high),
      y2: py(low),
      stroke: "#aaa6b8",
      "stroke-width": 3,
    }),
  );
  svg.append(
    svgElement(
      "text",
      {
        x: px(0) - 16,
        y: (py(high) + py(low)) / 2,
        "text-anchor": "middle",
        transform: `rotate(-90 ${px(0) - 16} ${(py(high) + py(low)) / 2})`,
      },
      "wall",
    ),
  );
  const [innerY, innerZ] = data.grip_inner,
    [outerY, outerZ] = data.grip_outer;
  const dimensionY = py(Math.max(innerY, outerY) + 8);
  svg.append(
    svgElement("line", {
      x1: px(innerZ),
      x2: px(outerZ),
      y1: dimensionY,
      y2: dimensionY,
      stroke: "#c2afea",
      "stroke-width": 1.5,
    }),
  );
  for (const z of [innerZ, outerZ]) {
    svg.append(
      svgElement("line", {
        x1: px(z),
        x2: px(z),
        y1: dimensionY - 4,
        y2: dimensionY + 4,
        stroke: "#c2afea",
      }),
    );
  }
  svg.append(
    svgElement(
      "text",
      {
        x: (px(innerZ) + px(outerZ)) / 2,
        y: dimensionY - 8,
        "text-anchor": "middle",
        class: "dimension-label",
      },
      `${parameters.edge_depth} mm nominal`,
    ),
  );
  svg.append(
    svgElement(
      "text",
      { x: 240, y: 222, "text-anchor": "middle" },
      `${parameters.incut}° incut · ${lipRadiusLabel(data, parameters)}`,
    ),
  );
}
