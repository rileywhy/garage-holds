export const STL_VIEWS = [
  { id: "side", label: "Side" },
  { id: "other-side", label: "Other side" },
  { id: "end", label: "End" },
  { id: "other-end", label: "Other end" },
  { id: "overview", label: "Overview" },
] as const;

export type StlView = (typeof STL_VIEWS)[number]["id"];
