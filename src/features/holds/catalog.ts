import { ratingSummary } from "./rows";
import type { HoldFilters, Review } from "./types";

// Filtering, search, sorting and paging happen in the database (see
// catalog-query.ts and repository.ts); what is left here is the arithmetic
// the pages share.

export function activeFilterCount(filters: HoldFilters): number {
  return (
    filters.types.length +
    Number(Boolean(filters.designMethod)) +
    filters.sizes.length +
    filters.mounts.length +
    filters.materials.length +
    filters.specialProcesses.length +
    Number(filters.targetGrade !== null)
  );
}

export function reviewSummary(reviews: Review[], holdId: string) {
  return ratingSummary(
    reviews
      .filter((review) => review.holdId === holdId)
      .map((review) => review.rating),
  );
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
