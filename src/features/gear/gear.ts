// The things a person needs to print and mount a hold, with one pick each.
// Every shopping link on the site comes from this table, so a product is
// swapped in one place. Links go to Amazon with the site's associate tag
// when NEXT_PUBLIC_AMAZON_TAG is set, and to the same Amazon page without
// it otherwise.

export interface GearItem {
  id: string;
  // What the link says.
  label: string;
  // An Amazon product id for a specific product, or a search when none is
  // pinned yet. A search never goes dead; a product converts better.
  asin?: string;
  search: string;
}

export const GEAR = {
  printer: {
    id: "printer",
    label: "Bambu Lab A1",
    search: "Bambu Lab A1 3D printer",
  },
  printerEnclosed: {
    id: "printer-enclosed",
    label: "Bambu Lab P1S",
    search: "Bambu Lab P1S 3D printer",
  },
  petg: {
    id: "petg",
    label: "Polymaker PolyLite PETG",
    search: "Polymaker PolyLite PETG 1.75mm",
  },
  petgBambu: {
    id: "petg-bambu",
    label: "Bambu PETG HF",
    search: "Bambu Lab PETG HF filament",
  },
  dryer: {
    id: "dryer",
    label: "filament dryer",
    search: "filament dryer box 1.75mm",
  },
  woodScrews: {
    id: "wood-screws",
    label: "#10 star-drive wood screws",
    search: "#10 x 2 inch star drive wood screws",
  },
} as const satisfies Record<string, GearItem>;

export type GearId = keyof typeof GEAR;

export function amazonTag() {
  return process.env.NEXT_PUBLIC_AMAZON_TAG || null;
}

// The Amazon URL for an item, tagged when the site has an associate tag.
export function gearUrl(item: GearItem, tag = amazonTag()) {
  const url = item.asin
    ? new URL(`https://www.amazon.com/dp/${item.asin}`)
    : new URL(`https://www.amazon.com/s?k=${encodeURIComponent(item.search)}`);
  if (tag) url.searchParams.set("tag", tag);
  return url.toString();
}

// The filament link for a lab or recipe, by the material's name. Anything
// that is not PETG or PLA points at the guide instead of a product.
export function filamentFor(material: string): GearItem | null {
  const name = material.toLowerCase();
  if (name.includes("petg")) return GEAR.petg;
  return null;
}

export const TIP_URL = process.env.NEXT_PUBLIC_TIP_URL || null;

// Amazon's required wording, shown wherever their links appear.
export const AMAZON_DISCLOSURE =
  "As an Amazon Associate, Garage Holds earns from qualifying purchases.";
