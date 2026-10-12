"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight, Star } from "lucide-react";
import type { Hold, Review } from "./types";
import { reviewSummary } from "./catalog";
import { formatProblemGrade, GRADE_BOARD_ANGLE } from "./grades";
import { HoldVisual, previewModel } from "@/components/hold-art";
import { SaveButton } from "@/components/save-button";

export function HoldCard({
  hold,
  reviews,
  saved,
  signedIn,
  actions,
}: {
  hold: Hold;
  reviews: Review[];
  saved: boolean;
  signedIn: boolean;
  actions?: ReactNode;
}) {
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  // Photos first, then the 3D preview of the model when there is one.
  const photoCount =
    hold.photos.length + (hold.photos.length && previewModel(hold) ? 1 : 0);
  const photoIndex = photoCount ? selectedPhoto % photoCount : 0;
  const showingModel = photoIndex >= hold.photos.length;
  const summary = reviewSummary(reviews, hold.id);
  return (
    <article className="hold-card">
      <div className="card-visual">
        <Link href={`/holds/${hold.id}`} tabIndex={-1} aria-hidden="true">
          <HoldVisual hold={hold} photoIndex={photoIndex} />
        </Link>
        {photoCount > 1 && (
          <>
            <button
              type="button"
              className="card-photo-arrow previous"
              aria-label={`Previous view of ${hold.title}`}
              onClick={() =>
                setSelectedPhoto(
                  (current) => (current + photoCount - 1) % photoCount,
                )
              }
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="card-photo-arrow next"
              aria-label={`Next view of ${hold.title}`}
              onClick={() =>
                setSelectedPhoto((current) => (current + 1) % photoCount)
              }
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <span
              className="card-photo-count"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="sr-only">
                {showingModel ? "3D preview, view " : "Photo "}
              </span>
              {showingModel ? "3D" : `${photoIndex + 1} / ${photoCount}`}
              <span className="sr-only"> of {hold.title}</span>
            </span>
          </>
        )}
        <span className="card-label">
          {hold.status === "draft" ? "DRAFT" : "FREE"}
        </span>
        <SaveButton
          id={hold.id}
          title={hold.title}
          saved={saved}
          signedIn={signedIn}
        />
      </div>
      <div className="card-info">
        <div className="card-title-row">
          <h3>
            <Link href={`/holds/${hold.id}`}>{hold.title}</Link>
          </h3>
          <ArrowUpRight size={18} className="card-arrow" />
        </div>
        <p className="creator">by {hold.creator}</p>
        <div className="card-tags">
          <span>{hold.type}</span>
          <span>{hold.mount}</span>
          <span>{hold.recipes[0]?.material}</span>
        </div>
        <div className="card-bottom">
          <span>
            {hold.problemGrade === null
              ? hold.size
              : `${formatProblemGrade(hold.problemGrade)} at ${GRADE_BOARD_ANGLE}°`}
          </span>
          <span className="rating">
            <Star size={12} fill={summary.count ? "currentColor" : "none"} />
            {summary.average?.toFixed(1) ?? "No reviews"}
            {summary.count > 0 && <span>({summary.count})</span>}
          </span>
        </div>
        {actions && <div className="card-actions">{actions}</div>}
      </div>
    </article>
  );
}
