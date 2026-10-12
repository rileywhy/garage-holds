import { DESIGN_METHODS } from "@/features/holds/types";

export const DESIGN_METHOD_COPY = {
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

// Both upload and edit require a fresh choice. An existing design's value
// is deliberately not used as a default.
export function DesignMethodField() {
  return (
    <fieldset className="design-method-field">
      <legend>How was this hold shaped? *</legend>
      <p className="field-hint">
        Using Blender, CAD, or other modeling software counts as human-shaped.
      </p>
      {DESIGN_METHODS.map((method) => (
        <label className="design-method-option" key={method}>
          <input type="radio" name="designMethod" value={method} required />
          <span>
            <strong>{DESIGN_METHOD_COPY[method].label}</strong>
            <span>{DESIGN_METHOD_COPY[method].description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
