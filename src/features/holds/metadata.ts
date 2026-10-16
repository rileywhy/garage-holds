import type { Metadata } from "next";
import { SITE_IMAGE, SITE_NAME } from "@/lib/page-metadata";
import type { Hold } from "./types";

// Link-preview metadata for a design page. A published design shows its
// first photo, served from this origin by /holds/<id>/og so the address
// never expires; the photo id busts caches when the photo changes. Without
// a photo the site image stands in, set here because a page's openGraph
// replaces the layout's rather than adding to it.
export function designMetadata(hold: Hold | null): Metadata {
  if (!hold || hold.status !== "published")
    return { title: "Hold design", robots: { index: false, follow: false } };
  const photo = hold.photos[0];
  const description = `${hold.type} · ${hold.size} · ${hold.mount}. ${hold.description}`;
  return {
    title: hold.title,
    description: hold.description,
    alternates: { canonical: `/holds/${hold.id}` },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      title: hold.title,
      description,
      url: `/holds/${hold.id}`,
      images: [
        photo
          ? { url: `/holds/${hold.id}/og?v=${photo.id}`, alt: hold.title }
          : SITE_IMAGE,
      ],
    },
  };
}
