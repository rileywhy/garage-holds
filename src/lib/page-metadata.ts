import type { Metadata } from "next";

export const SITE_NAME = "Garage Holds";

// The site-wide card image, src/app/opengraph-image.png, at the address
// Next serves it from. The alt text matches opengraph-image.alt.txt.
export const SITE_IMAGE = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: "Garage Holds: free 3D printable climbing holds and hold generators",
};

// Metadata for a plain public page: its own title, description, canonical
// address, and link-preview fields. Without the openGraph block a page
// inherits the layout's, so a shared lab link would unfurl as the home page.
// With one, the page replaces the layout's whole openGraph, site name and
// image included, so both are set here again. A nearer opengraph-image.png
// (the labs have one each) still takes the place of the site image.
export function pageMetadata({
  title,
  description,
  path,
  type = "website",
}: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type,
      siteName: SITE_NAME,
      title,
      description,
      url: path,
      images: [SITE_IMAGE],
    },
  };
}
