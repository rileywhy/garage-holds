"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";
import { useLibrary } from "./library-provider";

export function SaveButton({
  id,
  title,
  labeled = false,
}: {
  id: string;
  title: string;
  labeled?: boolean;
}) {
  const { savedIds, toggleSaved, ready, storageError } = useLibrary();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saved = savedIds.includes(id);
  async function handleSave() {
    setBusy(true);
    setError("");
    try {
      await toggleSaved(id);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save this hold.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={labeled ? "save-control" : "card-save-control"}>
      <button
        type="button"
        className={
          labeled
            ? "button button-outline"
            : `save-button ${saved ? "saved" : ""}`
        }
        aria-label={`${saved ? "Unsave" : "Save"} ${title}`}
        aria-pressed={saved}
        disabled={!ready || busy || !!storageError}
        onClick={handleSave}
      >
        <Bookmark
          size={labeled ? 17 : 18}
          fill={saved ? "currentColor" : "none"}
        />
        {labeled && (saved ? "Saved" : "Save design")}
      </button>
      {error && (
        <span role="alert" className="save-error">
          {error}
        </span>
      )}
    </div>
  );
}
