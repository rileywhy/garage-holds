// Print colours for a design's model previews, so the pile reads as a shelf
// of different filaments rather than one. Picked from the design id, so a
// hold keeps its colour on cards, its page, and after an edit.
export const HOLD_COLORS = [
  "#9aa883",
  "#d17c48",
  "#d8b570",
  "#a2b5a6",
  "#86a7aa",
  "#a595b2",
  "#c09b76",
  "#c28277",
];

export function holdColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return HOLD_COLORS[hash % HOLD_COLORS.length];
}
