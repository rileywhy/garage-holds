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

export interface PageImage {
  url: string;
  width: number;
  height: number;
  alt: string;
}

// Metadata for a plain public page: its own title, description, canonical
// address, and link-preview fields. Without the openGraph block a page
// inherits the layout's, so a shared lab link would unfurl as the home page.
// With one, the page replaces the layout's whole openGraph, site name and
// root image included, so the site name is set here again. The image is
// set only when given: a page with its own opengraph-image.png beside it
// (every lab has one) must leave `images` out, because an image set here
// would replace the file's. A page without one passes SITE_IMAGE.
export function pageMetadata({
  title,
  description,
  path,
  type = "website",
  image,
  article,
}: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  image?: PageImage;
  // For an article: who wrote it and when, as ISO dates.
  article?: { authors: string[]; publishedTime: string; modifiedTime: string };
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
      ...(image ? { images: [image] } : {}),
      ...(article ?? {}),
    },
  };
}
