// Fictional designs for the catalog and validation tests; the site itself
// shows only uploaded designs.
import {
  SPECIAL_PROCESSES,
  type Hold,
  type HoldType,
  type MountType,
} from "../../src/features/holds/types";

const designs: {
  id: string;
  title: string;
  creator: string;
  type: HoldType;
  mount: MountType;
  color: string;
  size: Hold["size"];
  problemGrade: number;
  material: string;
  description: string;
}[] = [
  {
    id: "ripple-jug",
    title: "Ripple jug",
    creator: "Northline Studio",
    type: "Jug",
    mount: "Bolt-on",
    color: "#d17c48",
    size: "Large",
    problemGrade: 3,
    material: "PETG",
    description:
      "A generous lip and rounded body, imagined for warm-ups and flowing sequences. The rippled profile gives this sample design a little character. This is illustrative content, not a tested or downloadable hold.",
  },
  {
    id: "mesa-edge",
    title: "Mesa edge",
    creator: "Low Gravity",
    type: "Crimp",
    mount: "Screw-on",
    color: "#9aa883",
    size: "Medium",
    problemGrade: 5,
    material: "PETG-CF",
    description:
      "A simple edge concept with a subtly positive gripping surface. A compact addition to a dense training board. This sample illustrates the metadata and review experience; it is not a verified design.",
  },
  {
    id: "river-sloper",
    title: "River sloper",
    creator: "Northline Studio",
    type: "Sloper",
    mount: "Bolt-on",
    color: "#d8b570",
    size: "Large",
    problemGrade: 5,
    material: "PETG",
    description:
      "A smooth river-stone concept with a broad palm surface. Intended to demonstrate how sloping holds and grade suggestions appear in the library. Sample illustration only.",
  },
  {
    id: "split-pinch",
    title: "Split pinch",
    creator: "Form & Friction",
    type: "Pinch",
    mount: "Dual mount",
    color: "#a595b2",
    size: "Medium",
    problemGrade: 6,
    material: "ASA",
    description:
      "An asymmetric pinch concept with room to explore different thumb positions. Rotate a finished design to create new movement possibilities. This entry contains fictional recommendations for prototype testing.",
  },
  {
    id: "twin-pocket",
    title: "Twin pocket",
    creator: "Low Gravity",
    type: "Pocket",
    mount: "Bolt-on",
    color: "#86a7aa",
    size: "Medium",
    problemGrade: 4,
    material: "Nylon",
    description:
      "A rounded pocket concept with a recessed central grip. Use this sample to explore pocket and mounting filters. No physical performance or strength claim is made for this illustrative design.",
  },
  {
    id: "little-ledges",
    title: "Little ledges",
    creator: "Form & Friction",
    type: "Foothold",
    mount: "Screw-on",
    color: "#c28277",
    size: "Small",
    problemGrade: 5,
    material: "PETG-CF",
    description:
      "A small foothold concept for precise foot placement. Its small footprint demonstrates size filtering. This is sample content and does not include a printable file.",
  },
  {
    id: "canyon-crimp",
    title: "Canyon crimp",
    creator: "Northline Studio",
    type: "Crimp",
    mount: "Bolt-on",
    color: "#c09b76",
    size: "Small",
    problemGrade: 7,
    material: "PETG",
    description:
      "A low-profile edge concept with a broad mounting base. Fictional grade suggestions at 40° show how contextual recommendations can be presented.",
  },
  {
    id: "orbit-jug",
    title: "Orbit jug",
    creator: "Low Gravity",
    type: "Jug",
    mount: "Screw-on",
    color: "#a2b5a6",
    size: "Medium",
    problemGrade: 0,
    material: "PETG",
    description:
      "A rounded jug concept for approachable movement on steeper boards. The sample is here to help test browsing and saved collections, rather than represent a published climbing product.",
  },
];

export const SAMPLE_HOLDS: Hold[] = designs.map((design, index) => ({
  id: design.id,
  ownerId: null,
  status: "published",
  title: design.title,
  creator: design.creator,
  description: design.description,
  type: design.type,
  size: design.size,
  mount: design.mount,
  problemGrade: design.problemGrade,
  recipes: [
    {
      material: design.material,
      specialProcess: index === 1 ? SPECIAL_PROCESSES[0] : null,
      notes:
        "Sample recipe. Creators can document orientation, layer height, walls, infill, and their testing here.",
      textureNotes: "",
      postProcessing:
        index === 1 ? "Salt annealing (sample tag)" : "None specified",
    },
  ],
  tags: [
    design.type.toLowerCase(),
    "board training",
    ...(index === 1 ? ["salt annealing"] : []),
  ],
  license: "CC BY-NC 4.0",
  color: design.color,
  photos: [],
  files: [],
  createdAt: `2026-10-${String(9 - index).padStart(2, "0")}T12:00:00.000Z`,
}));
