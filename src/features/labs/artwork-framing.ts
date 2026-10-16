// Align visible silhouettes to the Crimp artwork, allowing for transparent padding.
export const ARTWORK_FRAMING: Record<
  string,
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
  "custom-shape": {
    width: 91.05145413870245,
    left: 4.1555928411633145,
    top: 2.525637583892617,
  },
};
