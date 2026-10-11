import Link from "next/link";
import {
  ArrowLeft,
  Download,
  FileBox,
  ArrowUpRight,
  Info,
  Pencil,
} from "lucide-react";
import { HoldVisual } from "@/components/hold-art";
import { PhotoImage } from "@/components/photo-image";
import { SaveButton } from "@/components/save-button";
import { LicenseSummary } from "@/components/license-summary";
import { FeedbackWidget } from "@/features/feedback/feedback-widget";
import { GRADE_BOARD_ANGLE, formatProblemGrade } from "./grades";
import { formatBytes } from "./catalog";
import { ReviewSection } from "@/features/reviews/review-section";
import type { Hold, Review } from "./types";

export function HoldDetail({
  hold,
  reviews,
  saved,
  signedIn,
  viewerId,
}: {
  hold: Hold;
  reviews: Review[];
  saved: boolean;
  signedIn: boolean;
  viewerId: string | null;
}) {
  const ownReview =
    reviews.find((review) => review.authorId === viewerId) ?? null;
  const isOwner = viewerId !== null && hold.ownerId === viewerId;
  return (
    <main className="main-container detail-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={15} /> Back to the library
      </Link>
      <div className="detail-layout">
        <div className="detail-gallery">
          <div className="detail-main-visual">
            <HoldVisual hold={hold} large />
            {hold.isSample && (
              <span className="illustration-label">
                Sample design illustration
              </span>
            )}
          </div>
          {hold.photos.length > 1 && (
            <div className="detail-extra-photos">
              {hold.photos.slice(1).map((photo, index) => (
                <PhotoImage
                  src={photo.cardUrl}
                  fallback={photo.url}
                  alt={`${hold.title}, additional photo ${index + 1}`}
                  key={photo.id}
                />
              ))}
            </div>
          )}
          <div className="gallery-caption">
            <span>
              {hold.isSample
                ? "Illustrative concept · no model files"
                : hold.photos.length
                  ? `${hold.photos.length} ${hold.photos.length === 1 ? "photo" : "photos"} · original model files`
                  : "No photos · original model files"}
            </span>
            <span>{hold.license}</span>
          </div>
        </div>
        <div className="detail-summary">
          <p className="eyebrow">
            {hold.isSample
              ? "SAMPLE DESIGN"
              : hold.status === "draft"
                ? "DRAFT · ONLY YOU CAN SEE THIS"
                : "FREE DESIGN"}
          </p>
          <h1>{hold.title}</h1>
          <p className="detail-creator">
            by <strong>{hold.creator}</strong>
            {isOwner && " (you)"}
          </p>
          <div className="card-tags">
            <span>{hold.type}</span>
            <span>{hold.size}</span>
            <span>{hold.mount}</span>
          </div>
          <p className="detail-description">{hold.description}</p>
          <div className="detail-actions">
            {!hold.isSample && (
              <SaveButton
                id={hold.id}
                title={hold.title}
                saved={saved}
                signedIn={signedIn}
                labeled
              />
            )}
            <a href="#files" className="button button-dark">
              View files <ArrowUpRight size={16} />
            </a>
            {isOwner && (
              <Link
                href={`/holds/${hold.id}/edit`}
                className="button button-outline"
              >
                <Pencil size={15} /> Edit details
              </Link>
            )}
          </div>
          <dl className="spec-grid">
            <div>
              <dt>Size</dt>
              <dd>{hold.size}</dd>
            </div>
            <div>
              <dt>Mounting</dt>
              <dd>{hold.mount}</dd>
            </div>
          </dl>
          {hold.problemGrade !== null && (
            <div className="grade-note">
              <span className="grade-value">
                {formatProblemGrade(hold.problemGrade)}
              </span>
              <div>
                <strong>at {GRADE_BOARD_ANGLE}°</strong>
                <p>
                  {hold.isSample
                    ? "Sample recommendation"
                    : "Creator’s suggested problem grade"}
                </p>
              </div>
            </div>
          )}
          <p className="field-hint">
            Grade suggestions are for a 40° board and depend on orientation and
            the rest of the problem.
          </p>
        </div>
      </div>
      <div className="detail-lower">
        <div>
          <section className="detail-section">
            <h2>Printing recipe</h2>
            {hold.recipes.map((recipe, index) => (
              <div className="recipe-card" key={index}>
                <div className="recipe-labels">
                  <span>{recipe.material}</span>
                  {recipe.specialProcess && (
                    <span>{recipe.specialProcess}</span>
                  )}
                </div>
                <p>{recipe.notes || "No print settings provided yet."}</p>
                <dl>
                  {recipe.textureNotes && (
                    <div>
                      <dt>Fuzzy skin / texture notes</dt>
                      <dd className="texture-notes">{recipe.textureNotes}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Finishing / treatment notes</dt>
                    <dd>{recipe.postProcessing || "None specified"}</dd>
                  </div>
                </dl>
              </div>
            ))}
            <p className="context-note">
              <Info size={15} />
              <span>
                Creator recipes and community reports document experience; they
                don’t certify a printed hold’s strength.
              </span>
            </p>
          </section>
          <ReviewSection
            holdId={hold.id}
            isSample={hold.isSample}
            reviews={reviews}
            signedIn={signedIn}
            ownReview={ownReview}
          />
        </div>
        <aside>
          <section className="files-panel" id="files">
            <h2>
              <FileBox size={19} /> Model files{" "}
              <span className="result-count">{hold.files.length}</span>
            </h2>
            {hold.files.length ? (
              <ul className="download-list">
                {hold.files.map((file) => (
                  <li key={file.id}>
                    <span className="file-extension">
                      {file.extension.toUpperCase()}
                    </span>
                    <div>
                      <strong title={file.name}>{file.name}</strong>
                      <small>{formatBytes(file.bytes)} · Original file</small>
                    </div>
                    {file.url ? (
                      <a
                        href={file.url}
                        className="icon-button"
                        aria-label={`Download ${file.name}`}
                        download={file.name}
                      >
                        <Download size={18} />
                      </a>
                    ) : (
                      <span className="icon-button" aria-hidden="true">
                        <Download size={18} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="sample-files">
                <p>This sample has no downloadable model.</p>
                <Link href="/upload">
                  Upload your first design <ArrowUpRight size={14} />
                </Link>
              </div>
            )}
            <p className="field-hint">
              {hold.files.length
                ? "Download links are valid for an hour; reload the page for fresh ones."
                : "Sample entries demonstrate browsing and filtering."}
            </p>
          </section>
          <section className="license-panel">
            <h3>Sharing & license</h3>
            <LicenseSummary license={hold.license} />
            {!hold.isSample && (
              <p className="detail-report">
                <FeedbackWidget
                  label="Report this design"
                  icon="report"
                  signedIn={signedIn}
                  prefill={`Reporting "${hold.title}" (/holds/${hold.id}): `}
                />
              </p>
            )}
            {hold.tags.length > 0 && (
              <>
                <h3 className="tags-heading">Design tags</h3>
                <div className="card-tags">
                  {hold.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
