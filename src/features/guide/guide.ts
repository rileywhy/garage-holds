import { SITE_IMAGE, SITE_NAME } from "@/lib/page-metadata";
import { siteUrl } from "@/lib/site-url";

// One record drives the guide's byline, its Open Graph article fields and
// its Article structured data, so none of them can drift from the others.
// Bump `updated` when the advice changes, not for typos.
export const GUIDE = {
  title: "How to 3D print climbing holds (and what you need)",
  description:
    "A practical guide to printing climbing holds for a home wall: which printer and filament, the slicer settings that keep a hold from breaking, and whether printed holds hold up.",
  path: "/how-to-3d-print-climbing-holds",
  author: "Riley Young",
  published: "2026-10-13",
  updated: "2026-10-15",
};

// "October 2026": the month of the last change, for the byline.
export function updatedLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Schema.org Article, for search results. The image is the card image the
// link previews use, until the guide has a photo of its own (RIL-18).
export function articleJsonLd() {
  const origin = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: GUIDE.title,
    description: GUIDE.description,
    author: { "@type": "Person", name: GUIDE.author },
    datePublished: GUIDE.published,
    dateModified: GUIDE.updated,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: `${origin}/icon.svg` },
    },
    image: `${origin}${SITE_IMAGE.url}`,
    mainEntityOfPage: `${origin}${GUIDE.path}`,
  };
}
