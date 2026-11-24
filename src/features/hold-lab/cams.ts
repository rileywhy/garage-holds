// Black Diamond Camalot C4 sizes and the widths each one spans, in
// millimetres, from the published size chart. Climbers name a crack by its
// cam: a crack is "a #2" when a #2 sits in the middle half of its range
// there, a quarter to three quarters open.
const CAMALOT_C4: [size: string, min: number, max: number][] = [
  ["0.3", 13.8, 23.4],
  ["0.4", 15.5, 26.7],
  ["0.5", 19.6, 33.5],
  ["0.75", 23.9, 41.2],
  ["1", 30.2, 52.1],
  ["2", 37.2, 64.9],
  ["3", 50.7, 87.9],
  ["4", 66.0, 114.7],
  ["5", 85.4, 148.5],
];

// The Camalot a crack of this width takes: "#0.4", "#0.3 or #0.4" where
// two sit well, the nearest fit otherwise, or a note past either end.
export function camalot(width: number): string {
  const sizes = CAMALOT_C4.filter(([, min, max]) => {
    const quarter = (max - min) / 4;
    return width >= min + quarter && width <= max - quarter;
  });
  if (sizes.length) return sizes.map(([size]) => `#${size}`).join(" or ");
  const fits = CAMALOT_C4.filter(
    ([, min, max]) => width >= min && width <= max,
  );
  if (!fits.length) return width < CAMALOT_C4[0][1] ? "under #0.3" : "over #5";
  const [size] = fits.reduce((best, cam) =>
    Math.abs(width - (cam[1] + cam[2]) / 2) <
    Math.abs(width - (best[1] + best[2]) / 2)
      ? cam
      : best,
  );
  return `#${size}`;
}
