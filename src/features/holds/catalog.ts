import type { Hold, HoldFilters, Review } from "./types";

export function filterHolds(holds: Hold[], filters: HoldFilters): Hold[] {
  const query = filters.query.trim().toLowerCase();
  const matches = holds.filter((hold) => {
    const search = [
      hold.title,
      hold.creator,
      hold.description,
      hold.type,
      ...hold.tags,
      ...hold.recipes.map(
        (r) =>
          `${r.material} ${r.specialProcess ?? ""} ${r.postProcessing} ${r.textureNotes}`,
      ),
    ]
      .join(" ")
      .toLowerCase();
    return (
      (!query || query.split(/\s+/).every((word) => search.includes(word))) &&
      (!filters.types.length || filters.types.includes(hold.type)) &&
      (!filters.sizes.length || filters.sizes.includes(hold.size)) &&
      (!filters.mounts.length || filters.mounts.includes(hold.mount)) &&
      ((!filters.materials.length && !filters.specialProcesses.length) ||
        hold.recipes.some(
          (recipe) =>
            (!filters.materials.length ||
              filters.materials.includes(recipe.material)) &&
            (!filters.specialProcesses.length ||
              (recipe.specialProcess !== null &&
                filters.specialProcesses.includes(recipe.specialProcess))),
        )) &&
      (filters.targetGrade === null ||
        hold.problemGrade === filters.targetGrade)
    );
  });
  if (filters.sort === "newest")
    matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (filters.sort === "title")
    matches.sort((a, b) => a.title.localeCompare(b.title));
  return matches;
}

export function activeFilterCount(filters: HoldFilters): number {
  return (
    filters.types.length +
    filters.sizes.length +
    filters.mounts.length +
    filters.materials.length +
    filters.specialProcesses.length +
    Number(filters.targetGrade !== null)
  );
}

export function reviewSummary(reviews: Review[], holdId: string) {
  const matching = reviews.filter((review) => review.holdId === holdId);
  return {
    count: matching.length,
    average: matching.length
      ? matching.reduce((sum, review) => sum + review.rating, 0) /
        matching.length
      : null,
  };
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
