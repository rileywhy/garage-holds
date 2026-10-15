import assert from "node:assert/strict";
import { test } from "node:test";
import { SITE_IMAGE, pageMetadata } from "../src/lib/page-metadata";
import { designMetadata } from "../src/features/holds/metadata";
import type { Hold } from "../src/features/holds/types";

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
    siteName: "Garage Holds",
    title: "Crimp Lab",
    description: "Shape a crimp.",
    url: "/make/crimp",
    images: [SITE_IMAGE],
  });
});

// A page's openGraph replaces the layout's whole block, so the site name
// and an image have to come along every time; the guide and the designs
// without photos used to unfurl with no picture.
test("every page and design card has a site name and an image", () => {
  const guide = pageMetadata({
    title: "How to print",
    description: "A guide.",
    path: "/how-to-3d-print-climbing-holds",
    type: "article",
  });
  const hold = {
    id: "abc",
    title: "Half-moon crimp",
    description: "A crimp.",
    type: "crimp",
    size: "medium",
    mount: "screw-on",
    status: "published",
    photos: [],
  } as unknown as Hold;
  const bare = designMetadata(hold);
  const photographed = designMetadata({
    ...hold,
    photos: [{ id: "p1" }],
  } as unknown as Hold);
  for (const metadata of [guide, bare, photographed]) {
    const openGraph = metadata.openGraph as {
      siteName?: string;
      images?: unknown[];
    };
    assert.equal(openGraph.siteName, "Garage Holds");
    assert.equal(openGraph.images?.length, 1);
  }
  assert.equal((guide.openGraph as { type: string }).type, "article");
  assert.deepEqual((bare.openGraph as { images: unknown[] }).images, [
    SITE_IMAGE,
  ]);
  assert.deepEqual((photographed.openGraph as { images: unknown[] }).images, [
    { url: "/holds/abc/og?v=p1", alt: "Half-moon crimp" },
  ]);
  assert.deepEqual(designMetadata(null), {
    title: "Hold design",
    robots: { index: false, follow: false },
  });
});
