import test from "node:test";
import assert from "node:assert/strict";
import {
  reviewSummary,
  activeFilterCount,
} from "../src/features/holds/catalog";
import { DEFAULT_FILTERS, type Review } from "../src/features/holds/types";

test("review averages include only reviews for the selected hold", () => {
  const reviews = [
    { holdId: "one", rating: 5 },
    { holdId: "one", rating: 3 },
    { holdId: "two", rating: 1 },
  ] as Review[];
  assert.deepEqual(reviewSummary(reviews, "one"), { count: 2, average: 4 });
  assert.deepEqual(reviewSummary(reviews, "missing"), {
    count: 0,
    average: null,
  });
});

test("the filter count ignores the search and the sort", () => {
  assert.equal(activeFilterCount(DEFAULT_FILTERS), 0);
  assert.equal(
    activeFilterCount({
      ...DEFAULT_FILTERS,
      query: "crimp",
      sort: "title",
      designMethod: "generated",
      types: ["Crimp", "Jug"],
      targetGrade: 5,
    }),
    4,
  );
});
