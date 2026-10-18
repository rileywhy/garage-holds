import type { Kind, Parameters, Preview } from "./api";

// The centre cross-section with the wall on the left, as a plain SVG. The
// crimp's drawing marks the edge depth between the grip points its
// generator reports; the others show the body with a caption.
export function Profile({
  data,
  kind,
  parameters,
}: {
  data: Preview;
  kind: Kind;
  parameters: Parameters;
}) {
  return kind === "crimp" ? (
    <CrimpProfile data={data} parameters={parameters} />
  ) : (
    <HoldProfile data={data} kind={kind} />
  );
}

const NOUNS: Record<Kind, string> = {
  crimp: "crimp",
  sloper: "sloper",
  jug: "jug",
  foot: "foothold",
  pocket: "pocket hold",
};

function outline(
  profile: [number, number][],
  px: (z: number) => number,
  py: (y: number) => number,
) {
  return (
    profile
      .map(([y, z], index) => `${index ? "L" : "M"}${px(z)},${py(y)}`)
      .join(" ") + " Z"
  );
}

function CrimpProfile({
  data,
  parameters,
}: {
  data: Preview;
  parameters: Parameters;
}) {
  const ys = data.profile.map(([y]) => y);
  const zs = data.profile.map(([, z]) => z);
  // Room above for the dimension line, and in front for the gridlines.
  const low = Math.min(...ys) - 8;
  const high = Math.max(...ys) + 15;
  const depth = Math.max(...zs) + 15;
  const scale = Math.min(350 / depth, 190 / (high - low));
  const originX = (480 - Math.max(...zs) * scale) / 2;
  const px = (z: number) => originX + z * scale;
  const py = (y: number) => 24 + (high - y) * scale;
  const [innerY, innerZ] = data.grip_inner ?? [0, 0];
  const [outerY, outerZ] = data.grip_outer ?? [0, 0];
  const dimensionY = py(Math.max(innerY, outerY) + 8);
  const gridlines: number[] = [];
  for (let z = 10; z < depth; z += 10) gridlines.push(z);
  const wallLabelY = (py(high) + py(low)) / 2;
  return (
    <svg
      className="lab-profile"
      viewBox="0 0 480 230"
      role="img"
      aria-label={`Centre cross-section of the ${NOUNS.crimp}, with the wall on the left`}
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
      <path d={outline(data.profile, px, py)} className="lab-profile-body" />
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
        {data.lip_radius != null &&
          data.lip_radius < Number(parameters.lip_radius) &&
          ` (${data.lip_radius} mm fits)`}
      </text>
    </svg>
  );
}

function caption(kind: Kind, p: Parameters) {
  if (kind === "jug") return `${p.edge_depth} mm reach · ${p.incut}° incut`;
  if (kind === "foot") return `${p.edge_depth} mm toe depth · ${p.incut}° bite`;
  if (kind === "pocket")
    return `${p.opening_width} mm opening · ${
      p.through ? "open to the wall" : `${p.pocket_depth} mm deep`
    } · ${p.incut} mm incut`;
  return `${p.incut}° lift · ${p.arc_wrap}° wrap · ${p.projection} mm depth`;
}

function HoldProfile({ data, kind }: { data: Preview; kind: Kind }) {
  // An open pocket splits the section in two: draw every outline.
  const parts = data.profiles ?? [data.profile];
  const ys = parts.flat().map(([y]) => y);
  const zs = parts.flat().map(([, z]) => z);
  const low = Math.min(...ys);
  const high = Math.max(...ys);
  const depth = Math.max(...zs);
  const scale = Math.min(330 / depth, 170 / (high - low));
  const px = (z: number) => 100 + z * scale;
  const py = (y: number) => 25 + (high - y) * scale;
  return (
    <svg
      className="lab-profile"
      viewBox="0 0 480 230"
      role="img"
      aria-label={`Centre cross-section of the ${NOUNS[kind]}, with the wall on the left`}
    >
      <path
        d={parts.map((part) => outline(part, px, py)).join(" ")}
        className="lab-profile-body"
      />
      <line
        x1={px(0)}
        x2={px(0)}
        y1={py(high) - 8}
        y2={py(low) + 8}
        className="lab-profile-wall"
      />
      <text x={80} y={120} textAnchor="middle" transform="rotate(-90 80 120)">
        wall
      </text>
      <text x={240} y={222} textAnchor="middle">
        {caption(kind, data.parameters ?? {})}
      </text>
    </svg>
  );
}
