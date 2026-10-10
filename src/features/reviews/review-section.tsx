"use client";

import { useRef, useState, type FormEvent } from "react";
import { Star, Plus, LoaderCircle } from "lucide-react";
import { ProblemGradeField } from "@/components/problem-grade-field";
import { GRADE_BOARD_ANGLE, formatProblemGrade } from "@/features/holds/grades";
import { Field, FieldErrors } from "@/components/form-fields";
import { optionalNumber } from "@/lib/form-data";
import { useLibrary } from "@/components/library-provider";
import { reviewSummary } from "@/features/holds/catalog";
import type { Review } from "@/features/holds/types";
import { validateReview } from "@/features/holds/validation";

export function ReviewSection({
  holdId,
  isSample,
}: {
  holdId: string;
  isSample: boolean;
}) {
  const { reviews, addReview, ready, storageError } = useLibrary();
  const matching = reviews.filter((review) => review.holdId === holdId);
  const summary = reviewSummary(reviews, holdId);
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const errorRegion = useRef<HTMLDivElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    const review: Review = {
      id: crypto.randomUUID(),
      holdId,
      author: text("author"),
      rating: Number(text("rating")),
      text: text("text"),
      material: text("material"),
      printSettings: text("printSettings"),
      postProcessing: text("postProcessing"),
      problemGrade: optionalNumber(form.get("problemGrade")),
      createdAt: new Date().toISOString(),
    };
    const issues = validateReview(review);
    if (issues.length) {
      setErrors(issues);
      requestAnimationFrame(() => errorRegion.current?.focus());
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      await addReview(review);
      formElement.reset();
      setOpen(false);
      setSuccess(true);
    } catch (error) {
      setErrors([
        error instanceof Error ? error.message : "Could not save your review.",
      ]);
    } finally {
      setBusy(false);
    }
  }

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
        <button
          className="button button-outline"
          onClick={() => {
            setOpen((value) => !value);
            setSuccess(false);
          }}
          aria-expanded={open}
          aria-controls="review-form"
        >
          <Plus size={15} /> {open ? "Close form" : "Leave a review"}
        </button>
      </div>
      {success && (
        <p className="success-box" role="status">
          Your review is saved in this browser.
        </p>
      )}
      {isSample && (
        <p className="field-hint">
          This is a sample design. Any reviews added here are local prototype
          feedback.
        </p>
      )}
      {open && (
        <form
          id="review-form"
          className="review-form"
          onSubmit={submit}
          aria-label="Leave a review"
        >
          <div ref={errorRegion} tabIndex={-1}>
            <FieldErrors errors={errors} />
          </div>
          <div className="form-grid">
            <Field label="Display name *">
              <input
                name="author"
                required
                minLength={2}
                maxLength={50}
                placeholder="Your name"
              />
            </Field>
            <Field label="Rating *">
              <select name="rating" defaultValue="5">
                {[5, 4, 3, 2, 1].map((rating) => (
                  <option key={rating} value={rating}>
                    {rating} {rating === 1 ? "star" : "stars"}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Your review *">
            <textarea
              name="text"
              required
              minLength={10}
              maxLength={2000}
              rows={3}
              placeholder="How did it print? How did it feel on your board?"
            />
          </Field>
          <Field label="Material">
            <input name="material" maxLength={80} placeholder="e.g. PETG-CF" />
          </Field>
          <Field label="Print settings">
            <input
              name="printSettings"
              maxLength={500}
              placeholder="Printer, orientation, walls, infill, layer height…"
            />
          </Field>
          <Field label="Post-processing">
            <input
              name="postProcessing"
              maxLength={200}
              placeholder="e.g. none, sanding, annealing"
            />
          </Field>
          <ProblemGradeField />
          <p className="field-hint">
            Grade suggestions refer to a 40° board. Display names are unverified
            in this prototype.
          </p>
          <button
            type="submit"
            className="button button-dark"
            disabled={busy || !ready || !!storageError}
          >
            {busy && <LoaderCircle size={15} className="spin" />}
            {busy ? "Saving…" : "Save local review"}
          </button>
        </form>
      )}
      {!matching.length && !open && (
        <div className="review-empty">
          <Star size={24} strokeWidth={1.2} />
          <div>
            <h3>A fresh start.</h3>
            <p>No reviews yet. Share what you learned from your print.</p>
          </div>
        </div>
      )}
      <div className="review-list">
        {matching.map((review) => (
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
                  })}{" "}
                  · Local review
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
