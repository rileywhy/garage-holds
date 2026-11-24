import { useState } from "react";
import { RotateCcw } from "lucide-react";
import type { Control } from "./api";

export function ControlRow({
  control,
  id = `lab-${control.key}`,
  value,
  disabled,
  clamp,
  onChange,
  onReset,
  auto,
}: {
  control: Pick<Control, "key" | "label" | "min" | "max" | "step" | "unit"> & {
    help?: string;
  };
  id?: string;
  value: number;
  disabled: boolean;
  // Snap a typed value into the slider's range; see LabKind.clampTyped.
  clamp: boolean;
  onChange: (key: string, value: number) => void;
  onReset: () => void;
  // An "auto" toggle beside the slider, for settings the generator can fit.
  auto?: {
    label?: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  };
}) {
  // Keep incomplete and out-of-range typing local. In particular, typing
  // "120" must be allowed to pass through "1" and "12" without snapping.
  const [draft, setDraft] = useState<string | null>(null);
  function handle(typed: number) {
    if (!Number.isFinite(typed)) return;
    const next = clamp
      ? Math.min(control.max, Math.max(control.min, typed))
      : typed;
    if (control.key === "screw_count" && !Number.isInteger(next)) return;
    onChange(control.key, next);
  }
  return (
    <div className="lab-control">
      <div className="lab-control-head">
        <label htmlFor={id}>{control.label}</label>
        <span className="lab-number">
          <input
            id={id}
            type="number"
            min={control.min}
            max={control.max}
            step={control.step}
            value={draft ?? (Number.isFinite(value) ? value : "")}
            disabled={disabled}
            aria-describedby={control.help ? `${id}-hint` : undefined}
            onFocus={(e) => setDraft(e.currentTarget.value)}
            onChange={(e) => {
              setDraft(e.currentTarget.value);
              const typed = e.currentTarget.valueAsNumber;
              if (!clamp || (typed >= control.min && typed <= control.max))
                handle(typed);
            }}
            onBlur={(e) => {
              if (e.currentTarget.valueAsNumber !== value)
                handle(e.currentTarget.valueAsNumber);
              setDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />
          <span>{control.unit}</span>
          <button
            type="button"
            className="lab-control-reset"
            disabled={disabled}
            aria-label={`Reset ${control.label}`}
            title={`Reset ${control.label}`}
            onClick={onReset}
          >
            <RotateCcw size={14} aria-hidden="true" />
          </button>
        </span>
      </div>
      <div className="lab-slider-with-auto">
        <input
          type="range"
          min={control.min}
          max={control.max}
          step={control.step}
          value={Number.isFinite(value) ? value : control.min}
          disabled={disabled}
          aria-label={`${control.label} slider`}
          aria-describedby={control.help ? `${id}-hint` : undefined}
          onChange={(e) => handle(e.target.valueAsNumber)}
          onDoubleClick={onReset}
        />
        {auto && (
          <label className="lab-toggle">
            <input
              type="checkbox"
              aria-label={auto.label}
              checked={auto.checked}
              disabled={disabled}
              onChange={(e) => auto.onChange(e.target.checked)}
            />
            auto
          </label>
        )}
      </div>
      {control.help && (
        <p className="lab-hint" id={`${id}-hint`}>
          {control.help}
        </p>
      )}
    </div>
  );
}
