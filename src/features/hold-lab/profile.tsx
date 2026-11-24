import type { Kind, Parameters, Preview } from "./api";
import {
  FINGER,
  FINGER_TAIL,
  FINGER_TAPE,
  fingerRest,
  placeFinger,
} from "./fingers";

// The centre cross-section with the wall on the left, as a plain SVG. The
// crimp's drawing marks the edge depth between the grip points its
// generator reports; the others show the body with a caption. The pinch's
// section runs across the hold, so its two gripping sides are the top and
// bottom of the drawing. Every drawing carries a finger to scale (see
// fingers.ts), lying straight with its tip toward the wall.
export function Profile({
  data,
  kind,
  parameters,
}: {
  data: Preview;
  kind: Kind;
  parameters: Parameters;
}) {
  return (
    <>
      {kind === "crimp" ? (
        <CrimpProfile data={data} parameters={parameters} />
      ) : (
        <HoldProfile data={data} kind={kind} />
      )}
      <p className="small-note">
        The finger is to scale, about median size: {FINGER.pad} mm to the first
        crease and {FINGER.pad + FINGER.middle} mm to the second.
      </p>
    </>
  );
}

// The finger on a drawing, and the room it needs there: up to its top, and
// out to just past its first crease. The rest of it runs on past the hold.
function fingerOn(kind: Kind, parts: [number, number][][], p: Parameters) {
  const placed = placeFinger(
    parts,
    fingerRest(kind, parts, p),
    FINGER.thickness,
  );
  return {
    ...placed,
    top: placed.rest + FINGER.thickness,
    reach: placed.tip + FINGER.pad + FINGER_TAIL,
  };
}

function Finger({
  at: { rest, tip },
  px,
  py,
  scale,
}: {
  at: ReturnType<typeof fingerOn>;
  px: (z: number) => number;
  py: (y: number) => number;
  scale: number;
}) {
  const radius = FINGER.thickness / 2;
  const end = tip + FINGER.pad + FINGER.middle + FINGER_TAIL;
  const top = py(rest + FINGER.thickness);
  const arc = radius * scale;
  // A wrap of tape behind the first crease, with the edge of its last turn
  // showing.
  const tape = px(tip + FINGER.pad + FINGER_TAPE.gap);
  const taped = FINGER_TAPE.width * scale;
  return (
    <g className="lab-profile-finger">
      <path
        d={`M${px(end)},${top} L${px(tip + radius)},${top} A${arc},${arc} 0 0 0 ${px(tip + radius)},${py(rest)} L${px(end)},${py(rest)}`}
      />
      {[FINGER.pad, FINGER.pad + FINGER.middle].map((along) => (
        <line
          key={along}
          x1={px(tip + along)}
          x2={px(tip + along)}
          y1={py(rest)}
          y2={py(rest + radius)}
        />
      ))}
      <rect
        className="lab-profile-tape"
        x={tape}
        y={top}
        width={taped}
        height={py(rest) - top}
      />
      <line
        className="lab-profile-tape"
        x1={tape + taped * 0.35}
        x2={tape + taped * 0.65}
        y1={top}
        y2={py(rest)}
      />
    </g>
  );
}

const NOUNS: Record<Kind, string> = {
  crimp: "crimp",
  sloper: "sloper",
  jug: "jug",
  foot: "foothold",
  pocket: "pocket hold",
  pinch: "pinch",
  roundpinch: "round pinch",
  crack: "crack",
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
  const physical = data.design?.parameters ?? parameters;
  const factor = Number(physical.size ?? 100) / 100;
  const edgeDepth = Number((Number(physical.edge_depth) * factor).toFixed(2));
  const lipRadius = Number((Number(physical.lip_radius) * factor).toFixed(2));
  const ys = data.profile.map(([y]) => y);
  const zs = data.profile.map(([, z]) => z);
  const finger = fingerOn("crimp", [data.profile], parameters);
  // Room above for the finger and the dimension line over them, and in
  // front for the gridlines.
  const low = Math.min(...ys) - 8;
  const high = finger.top + 22;
  const depth = Math.max(Math.max(...zs) + 15, finger.reach);
  const scale = Math.min(350 / depth, 190 / (high - low));
  const originX = (480 - Math.max(...zs) * scale) / 2;
  const px = (z: number) => originX + z * scale;
  const py = (y: number) => 24 + (high - y) * scale;
  const [innerY, innerZ] = data.grip_inner ?? [0, 0];
  const [outerY, outerZ] = data.grip_outer ?? [0, 0];
  const dimensionY = py(Math.max(innerY, outerY, finger.top) + 8);
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
      <Finger at={finger} px={px} py={py} scale={scale} />
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
        {edgeDepth} mm nominal
      </text>
      <text x={240} y={222} textAnchor="middle">
        {physical.incut}Â° incut Â· {lipRadius} mm lip radius
        {data.lip_radius != null &&
          data.lip_radius < lipRadius - 0.005 &&
          ` (${data.lip_radius} mm fits)`}
      </text>
    </svg>
  );
}

function caption(kind: Kind, p: Parameters) {
  const mm = (value: number | string | boolean, max = Infinity) =>
    Number(
      Math.min(max, (Number(value) * Number(p.size ?? 100)) / 100).toFixed(2),
    );
  if (kind === "jug" && p.shape === "handlebar")
    return `${mm(p.bar_thickness)} mm bar Â· ${mm(p.bar_clearance)} mm finger gap Â· ${mm(p.bar_span)} mm hand room`;
  if (kind === "jug")
    return `${mm(p.edge_depth, 140)} mm reach Â· ${p.incut}Â° incut`;
  if (kind === "foot")
    return `${mm(p.edge_depth)} mm toe depth Â· ${p.incut}Â° bite`;
  if (kind === "pocket")
    return `${p.opening_width} mm opening Â· ${
      p.through ? "open to the wall" : `${p.pocket_depth} mm deep`
    } Â· ${p.incut} mm incut`;
  if (kind === "roundpinch")
    return `${mm(p.width)} mm span Â· ${mm(p.rounding)} mm rounding Â· incut ${mm(p.thumb_incut)} mm thumb side below, ${mm(p.finger_incut)} mm finger side above`;
  if (kind === "pinch")
    return `${mm(p.width)} mm span Â· thumb side ${p.thumb_angle}Â° below Â· finger side ${p.finger_angle}Â° above`;
  if (kind === "crack") {
    const flare = Number(p.flare);
    return `${p.shape === "half" ? "One side" : `${mm(p.width)} mm crack`} Â· ${mm(p.depth)} mm deep Â· ${
      flare === 0
        ? "parallel"
        : `flared ${flare > 0 ? "out" : "in"} ${Math.abs(flare)}Â°`
    }`;
  }
  return `${p.incut}Â° lift Â· ${p.arc_wrap}Â° wrap Â· ${mm(p.projection)} mm depth`;
}

function HoldProfile({ data, kind }: { data: Preview; kind: Kind }) {
  // An open pocket splits the section in two: draw every outline.
  const parts = data.profiles ?? [data.profile];
  const ys = parts.flat().map(([y]) => y);
  const zs = parts.flat().map(([, z]) => z);
  const finger = fingerOn(kind, parts, data.parameters ?? {});
  const low = Math.min(...ys);
  const high = Math.max(...ys, finger.top);
  const depth = Math.max(...zs, finger.reach);
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
      <Finger at={finger} px={px} py={py} scale={scale} />
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
