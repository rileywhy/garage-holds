// How an uploaded model is turned before it is shown: a quarter-turn
// rotation on top of the mounting face the preview finds on its own
// (stl-scene.ts). Stored per file as the three axes the hold's own X, Y and
// Z land on, e.g. "x,-y,-z" is flipped over. The file itself is never
// changed; downloads are the original.

export type Orientation = string;

export const DEFAULT_ORIENTATION: Orientation = "x,y,z";

type Axis = [number, number, number];
// Columns: where the hold's X, Y and Z axes point after turning.
type Matrix = [Axis, Axis, Axis];

const AXES: Record<string, Axis> = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
  "-x": [-1, 0, 0],
  "-y": [0, -1, 0],
  "-z": [0, 0, -1],
};

export function parseOrientation(text: string): Matrix | null {
  const parts = text.split(",");
  if (parts.length !== 3) return null;
  const columns = parts.map((part) => AXES[part]);
  if (columns.some((column) => !column)) return null;
  const matrix = columns as Matrix;
  // Each axis used once, and no mirroring: a real rotation of the file.
  const used = new Set(parts.map((part) => part.replace("-", "")));
  return used.size === 3 && determinant(matrix) === 1 ? matrix : null;
}

export function isOrientation(text: unknown): text is Orientation {
  return typeof text === "string" && parseOrientation(text) !== null;
}

// Row-major 4x4 for three.js's Matrix4.fromArray/set, column-major
// elements for the 3x3 itself.
export function orientationElements(orientation: Orientation): number[] {
  const matrix = parseOrientation(orientation) ?? parseOrientation("x,y,z")!;
  const [x, y, z] = matrix;
  return [
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    0,
    0,
    0,
    1,
  ];
}

function determinant([a, b, c]: Matrix) {
  return (
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0])
  );
}

// Applies a quarter-turn rotation after the current one.
function rotate(orientation: Orientation, turn: Matrix): Orientation {
  const current = parseOrientation(orientation) ?? parseOrientation("x,y,z")!;
  return current
    .map((column) => {
      const result: Axis = [0, 0, 0];
      for (let row = 0; row < 3; row++)
        result[row] =
          turn[0][row] * column[0] +
          turn[1][row] * column[1] +
          turn[2][row] * column[2];
      return (Object.entries(AXES).find(([, axis]) =>
        axis.every((value, index) => value === result[index]),
      ) ?? ["x"])[0];
    })
    .join(",");
}

// The four moves the picker offers, each a quarter or half turn so the
// flat back is always one of the file's six faces.
// X runs across the hold, Y up the wall, Z out of the flat back.
export const MOVES = {
  // Top for bottom: the fix for a hold that came in upside down.
  flip: [
    [1, 0, 0],
    [0, -1, 0],
    [0, 0, -1],
  ] as Matrix,
  // Tip the top towards you: the former top becomes the front.
  tip: [
    [1, 0, 0],
    [0, 0, 1],
    [0, -1, 0],
  ] as Matrix,
  // Roll onto a side: the former right side becomes the back.
  roll: [
    [0, 0, -1],
    [0, 1, 0],
    [1, 0, 0],
  ] as Matrix,
  // Turn on the wall, a quarter clockwise seen from the front.
  turn: [
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, 1],
  ] as Matrix,
};

export type Move = keyof typeof MOVES;

export function moveOrientation(
  orientation: Orientation,
  move: Move,
): Orientation {
  return rotate(orientation, MOVES[move]);
}
