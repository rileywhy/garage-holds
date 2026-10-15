import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GUIDE,
  articleJsonLd,
  updatedLabel,
} from "../src/features/guide/guide";

test("the byline month and the structured data come from the one record", () => {
  assert.equal(updatedLabel("2026-10-15"), "October 2026");
  const article = articleJsonLd();
  assert.equal(article["@type"], "Article");
  assert.equal(article.headline, GUIDE.title);
  assert.equal(article.author.name, GUIDE.author);
  assert.equal(article.datePublished, GUIDE.published);
  assert.equal(article.dateModified, GUIDE.updated);
  assert.match(article.image, /^https?:\/\/.+\/opengraph-image\.png$/);
  assert.match(article.mainEntityOfPage, new RegExp(`${GUIDE.path}$`));
});
