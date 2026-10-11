import type { Parameters, Preview } from "./api";

// The centre cross-section with the wall on the left, as a plain SVG.
export function Profile({
  data,
  parameters,
}: {
  data: Preview;
  parameters: Parameters;
}) {
  const ys = data.profile.map((point) => point[0]);
  const zs = data.profile.map((point) => point[1]);
  const low = Math.min(...ys) - 8;
  const high = Math.max(...ys) + 15;
  const depth = Math.max(...zs) + 15;
  const scale = Math.min(350 / depth, 190 / (high - low));
  const originX = (480 - Math.max(...zs) * scale) / 2;
  const px = (z: number) => originX + z * scale;
  const py = (y: number) => 24 + (high - y) * scale;
  const path =
    data.profile
      .map(([y, z], index) => `${index ? "L" : "M"}${px(z)},${py(y)}`)
      .join(" ") + " Z";
  const [innerY, innerZ] = data.grip_inner;
  const [outerY, outerZ] = data.grip_outer;
  const dimensionY = py(Math.max(innerY, outerY) + 8);
  const gridlines: number[] = [];
  for (let z = 10; z < depth; z += 10) gridlines.push(z);
  const wallLabelY = (py(high) + py(low)) / 2;
  return (
    <svg
      className="lab-profile"
      viewBox="0 0 480 230"
      role="img"
      aria-label="Centre cross-section of the crimp, with the wall on the left"
    >
      {gridlines.map((z) => (
        <line
          key={z}
          x1={px(z)}
          x2={px(z)}
          y1={py(high)}
          y2={py(low)}
          className="lab-profile-grid"
        />
      ))}
      <path d={path} className="lab-profile-body" />
      <line
        x1={px(0)}
        x2={px(0)}
        y1={py(high)}
        y2={py(low)}
        className="lab-profile-wall"
      />
      <text
        x={px(0) - 16}
        y={wallLabelY}
        textAnchor="middle"
        transform={`rotate(-90 ${px(0) - 16} ${wallLabelY})`}
      >
        wall
      </text>
      <line
        x1={px(innerZ)}
        x2={px(outerZ)}
        y1={dimensionY}
        y2={dimensionY}
        className="lab-profile-dimension"
      />
      {[innerZ, outerZ].map((z) => (
        <line
          key={z}
          x1={px(z)}
          x2={px(z)}
          y1={dimensionY - 4}
          y2={dimensionY + 4}
          className="lab-profile-dimension"
        />
      ))}
      <text
        x={(px(innerZ) + px(outerZ)) / 2}
        y={dimensionY - 8}
        textAnchor="middle"
        className="lab-profile-label"
      >
        {parameters.edge_depth} mm nominal
      </text>
      <text x={240} y={222} textAnchor="middle">
        {parameters.incut}° incut · {parameters.lip_radius} mm lip radius
      </text>
    </svg>
  );
}
