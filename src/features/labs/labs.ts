interface Generator {
  port: number;
  tool: string;
  // The settings-file version written by the Python generator.
  version: number;
  // Defaults for settings missing from older saved files.
  olderFileDefaults?: Record<string, number | boolean | string>;
  profileNoun: string;
  viewer: {
    color?: number;
    separateBack: boolean;
    character: number;
    seedHint: string;
    clampTyped: boolean;
    angledSide?: boolean;
  };
}

interface LabDefinition {
  slug: string;
  label: string;
  // The page and preset name, when it is not "<label> Lab".
  name?: string;
  socialCardText: string;
  short: string;
  status?: "experimental" | "out of order";
  artwork: { width: number; left: number; top: number };
  artworkSlug?: string;
  // An unlisted lab keeps its page, generator and presets but is left off
  // the cards, the switcher and the sitemap (the classic Pinch Lab, kept
  // so older settings files, presets and links still open).
  listed?: false;
  generator?: Generator;
}

const rounded = {
  separateBack: true,
  character: 0.65,
  seedHint: "Different rounded surfaces. Reset returns to the clean default.",
  clampTyped: false,
};

// The order here is the order of the lab cards and switcher.
const definitions = [
  {
    slug: "crimp",
    label: "Crimp",
    socialCardText:
      "Edge depth, incut, lip rounding, and\nscrew holes. Export a printable STL.",
    short: "crimp",
    artwork: {
      width: 100,
      left: -2.25,
      top: 0,
    },
    generator: {
      port: 8766,
      tool: "crimp-generator",
      version: 1,
      olderFileDefaults: { screw_count: 2, auto_seat: false },
      profileNoun: "crimp",
      viewer: {
        separateBack: false,
        character: 1.4,
        seedHint:
          "Seeds create different body folds. Changing the seed starts with visible character; dial it down for a subtler shape, or reset for the clean default.",
        clampTyped: true,
      },
    },
  },
  {
    slug: "sloper",
    label: "Sloper",
    socialCardText:
      "Curve, incut lift, and slope. Preview it\non a 40° board and export an STL.",
    short: "sloper",
    artwork: {
      width: 100,
      left: -3.75,
      top: -4.48,
    },
    generator: {
      port: 8771,
      tool: "sloper-generator",
      version: 1,
      olderFileDefaults: { incut: 0 },
      profileNoun: "sloper",
      viewer: {
        ...rounded,
        angledSide: false,
      },
    },
  },
  {
    slug: "jug",
    label: "Jug",
    socialCardText:
      "Board jug, deep jug, or two-handed.\nFind the bite and export an STL.",
    short: "jug",
    artwork: {
      width: 100,
      left: -6.75,
      top: 2.88,
    },
    generator: {
      port: 8781,
      tool: "jug-generator",
      version: 2,
      profileNoun: "jug",
      viewer: { ...rounded, color: 0xe9b416 },
    },
  },
  {
    slug: "foot",
    label: "Foot",
    socialCardText:
      "Edges, chips, smears, balls and dishes\nwith screw holes. Export a printable STL.",
    short: "foot",
    status: "experimental",
    artwork: {
      width: 80.5940594059406,
      left: 9.702970297029703,
      top: 7.4629702970297025,
    },
    generator: {
      port: 8785,
      tool: "foot-generator",
      version: 2,
      profileNoun: "foothold",
      viewer: { ...rounded, color: 0xe07a1f },
    },
  },
  {
    slug: "pocket",
    label: "Pocket",
    socialCardText:
      "A mono, two- or three-finger pocket in a\nround body. Export a printable STL.",
    short: "pocket",
    status: "experimental",
    artwork: {
      width: 92.94,
      left: 3.53,
      top: -5.18,
    },
    generator: {
      port: 8795,
      tool: "pocket-generator",
      version: 1,
      profileNoun: "pocket hold",
      viewer: {
        ...rounded,
        color: 0x2f6fde,
        seedHint:
          "Seeds wobble the rim and drift the crown; the pocket stays put. Reset returns to the clean default.",
      },
    },
  },
  {
    slug: "pinch",
    label: "Pinch",
    // Beside the Round Pinch Lab that replaced it on the cards.
    name: "Classic Pinch Lab",
    socialCardText:
      "A block between thumb and fingers: span,\nside angles and offset. Export an STL.",
    short: "classic pinch",
    status: "experimental",
    listed: false,
    artwork: {
      width: 98.78,
      left: -1.02,
      top: 0.82,
    },
    generator: {
      port: 8796,
      tool: "pinch-generator",
      version: 1,
      profileNoun: "pinch",
      viewer: {
        ...rounded,
        color: 0xd9412c,
        seedHint:
          "Seeds wave the sides in and out along the pinch; the back stays put. Reset returns to the clean default.",
      },
    },
  },
  {
    slug: "roundpinch",
    label: "Round Pinch",
    socialCardText:
      "A rounder, more incut pinch: a full round\nover a hollow. Export a printable STL.",
    short: "round pinch",
    status: "experimental",
    artwork: {
      width: 98.78,
      left: -1.02,
      top: 0.82,
    },
    // Borrow the Pinch Lab render while Round Pinch is on trial.
    artworkSlug: "pinch",
    generator: {
      port: 8798,
      tool: "round-pinch-generator",
      version: 1,
      profileNoun: "round pinch",
      viewer: { ...rounded, color: 0xc2410c },
    },
  },
  {
    slug: "crack",
    label: "Crack",
    socialCardText:
      "Fingers, hands or fists: width, depth,\nflare and locks. Export an STL.",
    short: "crack",
    status: "experimental",
    artwork: {
      width: 84.02,
      left: 8.03,
      top: 5.12,
    },
    generator: {
      port: 8797,
      tool: "crack-generator",
      version: 1,
      profileNoun: "crack",
      viewer: {
        ...rounded,
        // Red sandstone, after the desert splitters crack climbers train for.
        color: 0xcf9f8f,
        seedHint:
          "Seeds wander the crack from side to side along its length; its width stays as set. Reset returns to the clean default.",
      },
    },
  },
  {
    slug: "custom-shape",
    label: "Custom Shape",
    socialCardText:
      "Paint a silhouette, shape the grip, place\nthe screws. Export a printable STL.",
    short: "custom shape",
    status: "out of order",
    artwork: {
      width: 91.05145413870245,
      left: 4.1555928411633145,
      top: 2.525637583892617,
    },
  },
] as const satisfies readonly LabDefinition[];

type Definition = (typeof definitions)[number];
export type LabSlug = Definition["slug"];
export type GeneratorKind = Extract<
  Definition,
  { generator: Generator }
>["slug"];

// Every lab with a page, listed or not.
export const ALL_LABS = definitions.map(
  ({
    slug,
    label,
    name,
    short,
    ...options
  }: LabDefinition & { slug: LabSlug }) => ({
    slug,
    label,
    short,
    name: name ?? `${label} Lab`,
    href: `/make/${slug}`,
    image: `/images/hold-labs/${options.artworkSlug ?? slug}.webp`,
    ...options,
  }),
);

// The labs on the cards, in the switcher and in the sitemap.
export const LABS = ALL_LABS.filter(({ listed }) => listed !== false);

export const GENERATOR_LABS = ALL_LABS.filter(
  (
    lab,
  ): lab is (typeof ALL_LABS)[number] & {
    slug: GeneratorKind;
    generator: Generator;
  } => lab.generator !== undefined,
);

export const GENERATORS = Object.fromEntries(
  GENERATOR_LABS.map(({ slug, generator }) => [slug, generator]),
) as Record<GeneratorKind, Generator>;

export function generatorEnvName(kind: GeneratorKind) {
  return `${kind.toUpperCase()}_API_URL`;
}
