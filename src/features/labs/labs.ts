// The one list of labs. The hub draws its cards from it and every lab page
// draws its navigation from it, so adding a lab here adds it everywhere.
export interface LabInfo {
  slug: string;
  name: string;
  // The short word used in the switcher row on a lab page.
  short: string;
  href: string;
  image: string;
  description: string;
  experimental?: boolean;
}

export const LABS: LabInfo[] = [
  {
    slug: "crimp",
    name: "Crimp Lab",
    short: "crimp",
    href: "/make/crimp",
    image: "/images/hold-labs/crimp.webp",
    description:
      "Dial in a precise edge, adjust the incut, and soften the lip for your fingertips.",
  },
  {
    slug: "sloper",
    name: "Sloper Lab",
    short: "sloper",
    href: "/make/sloper",
    image: "/images/hold-labs/sloper.webp",
    description:
      "Shape a rounded hold with broad curves and a surface built for open-hand grip.",
  },
  {
    slug: "jug",
    name: "Jug Lab",
    short: "jug",
    href: "/make/jug",
    image: "/images/hold-labs/jug.webp",
    description:
      "Make a board jug, a deep jug, or a two-handed jug with a comfortable grabbing edge.",
  },
  {
    slug: "foot",
    name: "Foot Lab",
    short: "foot",
    href: "/make/foot",
    image: "/images/hold-labs/foot.webp",
    description:
      "Board edges, toe-in edges, chips, smears, balls and dishes, sized for one, two or three screws.",
    experimental: true,
  },
  {
    slug: "custom-shape",
    name: "Custom Shape Lab",
    short: "custom shape",
    href: "/make/custom-shape",
    image: "/images/hold-labs/custom-shape.webp",
    description:
      "Paint your own silhouette, shape the grip, and place mounting holes where you need them.",
  },
];
