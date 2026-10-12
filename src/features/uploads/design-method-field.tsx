import { DESIGN_METHODS } from "@/features/holds/types";
import { DESIGN_METHOD_COPY } from "@/features/holds/design-method";

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
