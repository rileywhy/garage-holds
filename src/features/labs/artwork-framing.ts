import type { LabSlug } from "./labs";

// Where each lab's artwork sits in the carousel's frame, as a percentage of
// the frame: the silhouette centred, its top edge level with the Crimp's,
// and the later labs scaled so their silhouettes stand about as tall. The
// table is keyed by LabSlug so a new lab cannot be left out of it.
export const ARTWORK_FRAMING: Record<
  LabSlug,
  { width: number; left: number; top: number }
> = {
  crimp: {
    width: 100,
    left: -2.25,
    top: 0,
  },
  sloper: {
    width: 100,
    left: -3.75,
    top: -4.48,
  },
  jug: {
    width: 100,
    left: -6.75,
    top: 2.88,
  },
  foot: {
    width: 80.5940594059406,
    left: 9.702970297029703,
    top: 7.4629702970297025,
  },
  pocket: {
    width: 92.94,
    left: 3.53,
    top: -5.18,
  },
  pinch: {
    width: 100,
    left: -0.9,
    top: -1.6,
  },
  "custom-shape": {
    width: 91.05145413870245,
    left: 4.1555928411633145,
    top: 2.525637583892617,
  },
};
