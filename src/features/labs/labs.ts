// Every lab's slug. A new lab is added here and to LABS below; a table keyed
// by LabSlug, like the carousel's artwork framing, then needs its entry
// before the type checker is satisfied.
export type LabSlug =
  | "crimp"
  | "sloper"
  | "jug"
  | "foot"
  | "pocket"
  | "roundpinch"
  | "custom-shape";

export interface LabInfo {
  slug: LabSlug;
  name: string;
  // The short word used in the switcher row on a lab page.
  short: string;
  href: string;
  image: string;
  // A tag on the lab's card: "experimental" for a new lab, "out of order"
  // for one that still opens but is waiting on a rework.
  status?: "experimental" | "out of order";
}

// The one list of labs. The hub draws its cards from it and every lab page
// draws its navigation from it, so adding a lab here adds it everywhere.
export const LABS: LabInfo[] = [
  {
    slug: "crimp",
    name: "Crimp Lab",
    short: "crimp",
    href: "/make/crimp",
    image: "/images/hold-labs/crimp.webp",
  },
  {
    slug: "sloper",
    name: "Sloper Lab",
    short: "sloper",
    href: "/make/sloper",
    image: "/images/hold-labs/sloper.webp",
  },
  {
    slug: "jug",
    name: "Jug Lab",
    short: "jug",
    href: "/make/jug",
    image: "/images/hold-labs/jug.webp",
  },
  {
    slug: "foot",
    name: "Foot Lab",
    short: "foot",
    href: "/make/foot",
    image: "/images/hold-labs/foot.webp",
    status: "experimental",
  },
  {
    slug: "pocket",
    name: "Pocket Lab",
    short: "pocket",
    href: "/make/pocket",
    image: "/images/hold-labs/pocket.webp",
    status: "experimental",
  },
  {
    slug: "roundpinch",
    name: "Round Pinch Lab",
    short: "round pinch",
    href: "/make/roundpinch",
    image: "/images/hold-labs/pinch.webp",
    status: "experimental",
  },
  {
    slug: "custom-shape",
    name: "Custom Shape Lab",
    short: "custom shape",
    href: "/make/custom-shape",
    image: "/images/hold-labs/custom-shape.webp",
    status: "out of order",
  },
];
