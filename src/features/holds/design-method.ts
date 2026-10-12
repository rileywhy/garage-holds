import type { DesignMethod } from "./types";

// How a design was shaped, as the creator reports it. The form copy asks
// the creator; the notes explain the answer to everyone else, on the card
// badge and beside "free grip" on the design page.
export const DESIGN_METHOD_COPY: Record<
  DesignMethod,
  { label: string; description: string }
> = {
  "human-shaped": {
    label: "Human-shaped",
    description:
      "You made the shape yourself, or made big changes to a generated shape.",
  },
  generated: {
    label: "Generated",
    description:
      "AI or a shape generator made most of the shape. You mainly adjusted settings or made small changes.",
  },
};

export const DESIGN_METHOD_NOTES: Record<
  DesignMethod,
  { label: string; description: string }
> = {
  "human-shaped": {
    label: "human shaped",
    description:
      "Human shaped: the creator made the shape themselves, or made big changes to a generated shape.",
  },
  generated: {
    label: "generated",
    description:
      "Generated: AI or a shape generator made most of the shape. The creator mainly adjusted settings or made small changes.",
  },
};
