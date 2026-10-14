"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Star, Plus, LoaderCircle } from "lucide-react";
import { ProblemGradeField } from "@/components/problem-grade-field";
import { GRADE_BOARD_ANGLE, formatProblemGrade } from "@/features/holds/grades";
import { Field, FieldErrors } from "@/components/form-fields";
import { reviewSummary } from "@/features/holds/catalog";
import type { Review } from "@/features/holds/types";
import { signInPath } from "@/features/auth/redirects";
import { trackEvent } from "@/features/analytics/events";
import { submitReview, type ReviewFormState } from "./actions";

export function ReviewSection({
  holdId,
  reviews,
  signedIn,
  ownReview,
}: {
  holdId: string;
  reviews: Review[];
  signedIn: boolean;
  ownReview: Review | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const summary = reviewSummary(reviews, holdId);
  const [open, setOpen] = useState(false);
  const errorRegion = useRef<HTMLDivElement>(null);
  const [state, action, pending] = useActionState(
    async (previous: ReviewFormState, formData: FormData) => {
      const result = await submitReview(previous, formData);
      if (result.saved) {
        trackEvent({ name: "review_posted", hold: holdId });
        setOpen(false);
        router.refresh();
      } else requestAnimationFrame(() => errorRegion.current?.focus());
      return result;
    },
    { errors: [], saved: false },
  );

  return (
    <section className="reviews-section" id="reviews">
      <div className="detail-section-heading">
        <div>
          <h2>
            From the board <span className="result-count">{summary.count}</span>
          </h2>
          <p>
            Printing notes, real-world context, and ideas for the next
            iteration.
          </p>
        </div>
        {signedIn ? (
          <button
            className="button button-outline"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="review-form"
          >
            <Plus size={15} />{" "}
            {open
              ? "Close form"
              : ownReview
                ? "Edit your review"
                : "Leave a review"}
          </button>
        ) : (
          <Link href={signInPath(pathname)} className="button button-outline">
            Sign in to review
          </Link>
        )}
      </div>
      {state.saved && !open && (
        <p className="success-box" role="status">
          Your review is published.
        </p>
      )}
      {open && (
        <form
          id="review-form"
          className="review-form"
          action={action}
          aria-label={ownReview ? "Edit your review" : "Leave a review"}
          aria-busy={pending}
        >
          <input type="hidden" name="designId" value={holdId} />
          <div ref={errorRegion} tabIndex={-1}>
            <FieldErrors errors={state.errors} />
          </div>
          <Field label="Rating *">
            <select name="rating" defaultValue={ownReview?.rating ?? 5}>
              {[5, 4, 3, 2, 1].map((rating) => (
                <option key={rating} value={rating}>
                  {rating} {rating === 1 ? "star" : "stars"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Your review *">
            <textarea
              name="text"
              required
              minLength={10}
              maxLength={2000}
              rows={3}
              defaultValue={ownReview?.text}
              placeholder="How did it print? How did it feel on your board?"
            />
          </Field>
          <Field label="Material">
            <input
              name="material"
              maxLength={80}
              defaultValue={ownReview?.material}
              placeholder="e.g. PETG-CF"
            />
          </Field>
          <Field label="Print settings">
            <input
              name="printSettings"
              maxLength={500}
              defaultValue={ownReview?.printSettings}
              placeholder="Printer, orientation, walls, infill, layer height…"
            />
          </Field>
          <Field label="Post-processing">
            <input
              name="postProcessing"
              maxLength={200}
              defaultValue={ownReview?.postProcessing}
              placeholder="e.g. none, sanding, annealing"
            />
          </Field>
          <ProblemGradeField defaultValue={ownReview?.problemGrade ?? null} />
          <p className="field-hint">
            Grade suggestions refer to a 40° board. Reviews are posted under
            your display name.
          </p>
          <button
            type="submit"
            className="button button-dark"
            disabled={pending}
          >
            {pending && <LoaderCircle size={15} className="spin" />}
            {pending ? "Saving…" : ownReview ? "Update review" : "Post review"}
          </button>
        </form>
      )}
      {!reviews.length && !open && (
        <div className="review-empty">
          <Star size={24} strokeWidth={1.2} />
          <div>
            <h3>A fresh start.</h3>
            <p>No reviews yet. Share what you learned from your print.</p>
          </div>
        </div>
      )}
      <div className="review-list">
        {reviews.map((review) => (
          <article className="review-card" key={review.id}>
            <div className="review-card-heading">
              <div className="avatar">{review.author[0]?.toUpperCase()}</div>
              <div>
                <strong>{review.author}</strong>
                <span>
                  {new Date(review.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {review.id === ownReview?.id && " · Your review"}
                </span>
              </div>
              <span
                className="review-stars"
                aria-label={`${review.rating} out of 5 stars`}
              >
                {Array.from({ length: 5 }, (_, index) => (
                  <Star
                    key={index}
                    size={13}
                    fill={index < review.rating ? "currentColor" : "none"}
                  />
                ))}
              </span>
            </div>
            <p className="review-text">{review.text}</p>
            <div className="card-tags">
              {review.material && <span>{review.material}</span>}
              {review.problemGrade !== null && (
                <span>
                  {formatProblemGrade(review.problemGrade)} at{" "}
                  {GRADE_BOARD_ANGLE}°
                </span>
              )}
            </div>
            {review.printSettings && (
              <p className="review-detail">
                <strong>Print:</strong> {review.printSettings}
              </p>
            )}
            {review.postProcessing && (
              <p className="review-detail">
                <strong>Post-processing:</strong> {review.postProcessing}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
