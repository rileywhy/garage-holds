"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LocalDate } from "@/components/local-date";
import { deleteLabPreset } from "./actions";
import { PRESET_LAB_NAMES } from "./saved-presets";
import type { AccountPreset } from "./repository";

// The lab presets on the Saved page: shapes saved in the labs, apart from
// the bookmarked designs. Each opens its lab with the shape already loaded.
export function PresetList({ presets }: { presets: AccountPreset[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function remove(preset: AccountPreset) {
    setError("");
    startTransition(async () => {
      const result = await deleteLabPreset(preset.lab, preset.id);
      if ("error" in result) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <section
      className="library-section preset-section"
      aria-label="Lab presets"
    >
      <div className="library-title-row">
        <div>
          <h2>
            Lab presets
            <span className="result-count">{presets.length}</span>
          </h2>
          <p>Shapes you saved in the labs. Open one to keep working on it.</p>
        </div>
      </div>
      {presets.length ? (
        <ul className="preset-list">
          {presets.map((preset) => (
            <li key={preset.id} className="preset-item">
              <span className="tag">{PRESET_LAB_NAMES[preset.lab]}</span>
              <div className="preset-item-body">
                <strong>{preset.name}</strong>
                <span className="preset-item-date">
                  Saved <LocalDate iso={preset.savedAt} />
                </span>
              </div>
              <div className="preset-item-actions">
                <Link
                  className="button button-outline"
                  href={`/make/${preset.lab}${preset.search}`}
                >
                  Open in lab
                </Link>
                <button
                  type="button"
                  className="button button-outline"
                  disabled={pending}
                  onClick={() => remove(preset)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small-note">
          Nothing yet. In any lab, “Save as preset” keeps the shape on screen
          here and in that lab’s starting-point menu.
        </p>
      )}
      {error && (
        <p className="small-note error-text" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
