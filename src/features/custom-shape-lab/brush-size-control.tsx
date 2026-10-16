import { useState } from "react";
import styles from "./custom-shape-lab.module.css";

export function BrushSizeControl({
  label,
  value,
  min = 0.5,
  max = 60,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const [entry, setEntry] = useState<string | null>(null);
  function change(value: number) {
    if (Number.isFinite(value)) onChange(Math.max(min, Math.min(max, value)));
  }
  return (
    <div className={styles.brushSize}>
      <div className={styles.controlHeader}>
        <span>Brush size</span>
        <label className={styles.valueInput}>
          <input
            aria-label={`${label} value`}
            type="number"
            min={min}
            max={max}
            step={0.5}
            value={entry ?? Math.round(value * 10) / 10}
            onFocus={() => setEntry(String(Math.round(value * 10) / 10))}
            onBlur={() => {
              if (entry?.trim()) change(Number(entry));
              setEntry(null);
            }}
            onChange={(e) => {
              setEntry(e.target.value);
              const next = e.target.valueAsNumber;
              if (Number.isFinite(next) && next >= min && next <= max)
                onChange(next);
            }}
          />
          <span>mm</span>
        </label>
      </div>
      <input
        aria-label={label}
        aria-valuetext={`${value.toFixed(1)} millimeters`}
        type="range"
        min={min}
        max={max}
        step="any"
        value={value}
        onChange={(e) => {
          setEntry(null);
          change(e.target.valueAsNumber);
        }}
      />
      <div className={styles.rangeLabels} aria-hidden="true">
        <span>Fine</span>
        <span>Broad</span>
      </div>
    </div>
  );
}
