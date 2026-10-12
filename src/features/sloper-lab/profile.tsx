import type { Preview } from "./api";

export function Profile({ data }: { data: Preview }) {
  const ys = data.profile.map(([y]) => y);
  const zs = data.profile.map(([, z]) => z);
  const low = Math.min(...ys),
    high = Math.max(...ys),
    depth = Math.max(...zs);
  const scale = Math.min(330 / depth, 170 / (high - low));
  const px = (z: number) => 100 + z * scale;
  const py = (y: number) => 25 + (high - y) * scale;
  const path =
    data.profile
      .map(([y, z], i) => `${i ? "L" : "M"}${px(z)},${py(y)}`)
      .join(" ") + " Z";
  return (
    <svg
      className="lab-profile"
      viewBox="0 0 480 230"
      role="img"
      aria-label="Centre cross-section of the sloper, with the wall on the left"
    >
      <path d={path} className="lab-profile-body" />
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
        {data.parameters.incut}° lift · {data.parameters.arc_wrap}° wrap ·{" "}
        {data.parameters.projection} mm depth
      </text>
    </svg>
  );
}
