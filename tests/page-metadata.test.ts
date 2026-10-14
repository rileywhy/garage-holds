import assert from "node:assert/strict";
import { test } from "node:test";
import { pageMetadata } from "../src/lib/page-metadata";

test("a page carries its own canonical and link-preview fields", () => {
  const metadata = pageMetadata({
    title: "Crimp Lab",
    description: "Shape a crimp.",
    path: "/make/crimp",
  });
  assert.equal(metadata.title, "Crimp Lab");
  assert.deepEqual(metadata.alternates, { canonical: "/make/crimp" });
  assert.deepEqual(metadata.openGraph, {
    type: "website",
    title: "Crimp Lab",
    description: "Shape a crimp.",
    url: "/make/crimp",
  });
});
