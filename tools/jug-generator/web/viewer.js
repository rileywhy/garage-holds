import { Viewer as SharedViewer } from "/shared-viewer.js";

// Keep the existing orbit/board behavior, lighting and GPU cleanup shared
// with the local sloper viewer. Only the jug's profile caption is different.
export class Viewer extends SharedViewer {
  constructor(container) {
    super(container);
    this.material.color.set(0xc2aadf);
  }

  setView(view) {
    if (view === "angled-side") {
      super.setView("side");
      this.pointCamera([1, 0.15, 0.25]);
    } else {
      super.setView(view);
      // The jug opens toward its top: look into the well rather than
      // presenting only the solid outer face on the initial preview.
      if (view === "three-quarter") this.pointCamera([1, 0.9, -1.1]);
      if (view === "board") this.pointCamera([1, 0.45, 0.65]);
    }
  }
}

export function drawProfile(svg, data) {
  const ys = data.profile.map(([y]) => y);
  const zs = data.profile.map(([, z]) => z);
  const low = Math.min(...ys),
    high = Math.max(...ys),
    depth = Math.max(...zs);
  const scale = Math.min(330 / depth, 170 / (high - low));
  const px = (z) => 100 + z * scale,
    py = (y) => 25 + (high - y) * scale;
  const element = (name, attributes, text) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attributes))
      node.setAttribute(key, String(value));
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const path =
    data.profile
      .map(([y, z], i) => `${i ? "L" : "M"}${px(z)},${py(y)}`)
      .join(" ") + " Z";
  svg.replaceChildren(
    element("path", {
      d: path,
      fill: "#61586f",
      stroke: "#c2afea",
      "stroke-width": 2,
    }),
    element("line", {
      x1: px(0),
      x2: px(0),
      y1: py(high) - 8,
      y2: py(low) + 8,
      stroke: "#aaa6b8",
      "stroke-width": 3,
    }),
    element(
      "text",
      {
        x: 80,
        y: 120,
        "text-anchor": "middle",
        transform: "rotate(-90 80 120)",
      },
      "wall",
    ),
    element(
      "text",
      { x: 240, y: 222, "text-anchor": "middle" },
      `${data.parameters.edge_depth} mm edge · ${data.parameters.incut}° incut · ${data.lip_radius} mm lip rounding`,
    ),
  );
}
