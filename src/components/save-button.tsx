"use client";

import { useOptimistic, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";
import { toggleBookmark } from "@/features/holds/bookmark-actions";
import { signInPath } from "@/features/auth/redirects";
import { trackEvent } from "@/features/analytics/events";

export function SaveButton({
  id,
  title,
  saved,
  signedIn,
  labeled = false,
}: {
  id: string;
  title: string;
  saved: boolean;
  signedIn: boolean;
  labeled?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [optimisticSaved, setOptimisticSaved] = useOptimistic(saved);
  const [error, setError] = useState("");
  function handleSave() {
    if (!signedIn) {
      router.push(signInPath(pathname));
      return;
    }
    setError("");
    const saving = !optimisticSaved;
    startTransition(async () => {
      setOptimisticSaved(saving);
      const result = await toggleBookmark(id);
      if ("error" in result) setError(result.error);
      else {
        if (saving) trackEvent({ name: "save_design", hold: id });
        router.refresh();
      }
    });
  }
  return (
    <div className={labeled ? "save-control" : "card-save-control"}>
      <button
        type="button"
        className={
          labeled
            ? "button button-outline"
            : `save-button ${optimisticSaved ? "saved" : ""}`
        }
        aria-label={`${optimisticSaved ? "Unsave" : "Save"} ${title}`}
        aria-pressed={optimisticSaved}
        disabled={pending}
        onClick={handleSave}
      >
        <Bookmark
          size={labeled ? 17 : 18}
          fill={optimisticSaved ? "currentColor" : "none"}
        />
        {labeled && (optimisticSaved ? "Saved" : "Save design")}
      </button>
      {error && (
        <span role="alert" className="save-error">
          {error}
        </span>
      )}
    </div>
  );
}
