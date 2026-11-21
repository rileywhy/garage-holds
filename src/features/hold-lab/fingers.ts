// A finger of about median size drawn to scale on a lab's side profile, as
// a ruler for how many pads a hold takes. It lies straight and level with
// its tip toward the wall. Sizes are estimates in millimetres: the pad runs
// from the fingertip to the first crease, the middle segment to the second.
import type { Kind, Parameters } from "./api";

export interface Finger {
  pad: number;
  middle: number;
  thickness: number;
}

export const FINGER: Finger = { pad: 27, middle: 18, thickness: 14 };

// How much finger is drawn past the second crease before it runs off.
export const FINGER_TAIL = 8;
// A wrap of finger tape, for looks: how far behind the first crease it
// starts and how wide it is.
export const FINGER_TAPE = { gap: 3, width: 12 };

// Profile outlines are [y, z] points: y up the wall, z out from it.
type Outline = [number, number][];

export interface FingerPlacement {
  // The height of the finger's underside and how far out its tip sits.
  rest: number;
  tip: number;
}

// Where the finger rests: on the highest point of the hold, or, in a
// pocket, on the lower lip of the opening, which is centred on the hold.
export function fingerRest(
  kind: Kind,
  parts: Outline[],
  parameters: Parameters,
): number {
  const opening = Number(parameters.opening_height);
  if (kind === "pocket" && Number.isFinite(opening)) return -opening / 2;
  return Math.max(...parts.flat().map(([y]) => y));
}

// The finger slides toward the wall until it meets the hold: the tip stops
// at the furthest-out material within the finger's own height, or at the
// wall when nothing is in the way. A millimetre of slack top and bottom
// keeps the surface it rests on from counting as an obstacle.
export function placeFinger(
  parts: Outline[],
  rest: number,
  thickness: number,
): FingerPlacement {
  const low = rest + 1;
  const high = rest + thickness - 1;
  let tip = 0;
  for (const part of parts) {
    part.forEach(([y1, z1], index) => {
      const [y2, z2] = part[(index + 1) % part.length];
      if (Math.max(y1, y2) < low || Math.min(y1, y2) > high) return;
      // The stretch of this edge inside the finger's height.
      const at = (y: number) =>
        y1 === y2 ? z1 : z1 + ((z2 - z1) * (y - y1)) / (y2 - y1);
      const from = Math.max(low, Math.min(y1, y2));
      const to = Math.min(high, Math.max(y1, y2));
      tip = Math.max(tip, at(from), at(to), y1 === y2 ? z2 : 0);
    });
  }
  return { rest, tip };
}
