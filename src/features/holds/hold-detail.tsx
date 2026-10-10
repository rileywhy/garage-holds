"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  Download,
  FileBox,
  ArrowUpRight,
  Info,
  LoaderCircle,
} from "lucide-react";
import { useLibrary } from "@/components/library-provider";
import { HoldVisual, StoredPhoto } from "@/components/hold-art";
import { SaveButton } from "@/components/save-button";
import { LicenseSummary } from "@/components/license-summary";
import { getAsset } from "@/lib/local-repository";
import { GRADE_BOARD_ANGLE, formatProblemGrade } from "./grades";
import { formatBytes } from "./catalog";
import { ReviewSection } from "@/features/reviews/review-section";
import type { ModelFile } from "./types";

export function HoldDetail({ id }: { id: string }) {
  const { holds, ready, storageError } = useLibrary();
  const hold = holds.find((hold) => hold.id === id);
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState("");
  async function download(file: ModelFile) {
    setDownloading(file.id);
    setDownloadError("");
    try {
      const blob = await getAsset(file.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : "Could not download this file.",
      );
    } finally {
      setDownloading("");
    }
  }
  if (!hold)
    return (
      <main className="main-container empty-state">
        {!ready ? (
          <p>Loading your design…</p>
        ) : (
          <>
            <h1>This design isn’t in your library.</h1>
            <p>
              {storageError ||
                "Local uploads are available only in the browser where they were added."}
            </p>
            <Link href="/" className="button button-dark">
              Back to the library
            </Link>
          </>
        )}
      </main>
    );
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
          {hold.photoIds.length > 1 && (
            <div className="detail-extra-photos">
              {hold.photoIds.slice(1).map((photo, index) => (
                <StoredPhoto
                  id={photo}
                  alt={`${hold.title}, additional photo ${index + 1}`}
                  key={photo}
                />
              ))}
            </div>
          )}
          <div className="gallery-caption">
            <span>
              {hold.isSample
                ? "Illustrative concept · no model files"
                : hold.photoIds.length
                  ? `${hold.photoIds.length} ${hold.photoIds.length === 1 ? "photo" : "photos"} · original model files`
                  : "No photos · original model files"}
            </span>
            <span>{hold.license}</span>
          </div>
        </div>
        <div className="detail-summary">
          <p className="eyebrow">
            {hold.isSample ? "SAMPLE DESIGN" : "FREE DESIGN · LOCAL UPLOAD"}
          </p>
          <h1>{hold.title}</h1>
          <p className="detail-creator">
            by <strong>{hold.creator}</strong>
          </p>
          <div className="card-tags">
            <span>{hold.type}</span>
            <span>{hold.size}</span>
            <span>{hold.mount}</span>
          </div>
          <p className="detail-description">{hold.description}</p>
          <div className="detail-actions">
            <SaveButton id={hold.id} title={hold.title} labeled />
            <a href="#files" className="button button-dark">
              View files <ArrowUpRight size={16} />
            </a>
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
          <ReviewSection holdId={hold.id} isSample={hold.isSample} />
        </div>
        <aside>
          <section className="files-panel" id="files">
            <h2>
              <FileBox size={19} /> Model files{" "}
              <span className="result-count">{hold.files.length}</span>
            </h2>
            {downloadError && (
              <p role="alert" className="error-box">
                {downloadError}
              </p>
            )}
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
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Download ${file.name}`}
                      disabled={!!downloading}
                      onClick={() => download(file)}
                    >
                      {downloading === file.id ? (
                        <LoaderCircle size={18} className="spin" />
                      ) : (
                        <Download size={18} />
                      )}
                    </button>
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
                ? "Files are stored on this device. Designs without photos show a simple STL preview when available."
                : "Sample entries demonstrate browsing and filtering."}
            </p>
          </section>
          <section className="license-panel">
            <h3>Sharing & license</h3>
            <LicenseSummary license={hold.license} />
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
