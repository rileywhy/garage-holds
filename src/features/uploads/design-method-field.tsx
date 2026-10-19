import { DESIGN_METHODS, type DesignMethod } from "@/features/holds/types";
import { DESIGN_METHOD_COPY } from "@/features/holds/design-method";

// Upload starts with neither option chosen, so every new design states how it
// was shaped. Edit starts from the design's stored value.
export function DesignMethodField({
  defaultValue = "",
}: {
  defaultValue?: DesignMethod | "";
}) {
  return (
    <fieldset className="design-method-field">
      <legend>How was this hold shaped? *</legend>
      <p className="field-hint">
        Using Blender, CAD, or other modeling software counts as human-shaped.
      </p>
      {DESIGN_METHODS.map((method) => (
        <label className="design-method-option" key={method}>
          <input
            type="radio"
            name="designMethod"
            value={method}
            defaultChecked={method === defaultValue}
            required
          />
          <span>
            <strong>{DESIGN_METHOD_COPY[method].label}</strong>
            <span>{DESIGN_METHOD_COPY[method].description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
