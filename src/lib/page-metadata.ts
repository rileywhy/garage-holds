import type { Metadata } from "next";

// Metadata for a plain public page: its own title, description, canonical
// address, and link-preview fields. Without the openGraph block a page
// inherits the layout's, so a shared lab link would unfurl as the home page.
// The preview image comes from the nearest opengraph-image.png file.
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", title, description, url: path },
  };
}
