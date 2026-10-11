import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// The library and design pages are for everyone; account pages, the upload
// flow, and the phone hand-off are not worth a crawler's time.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/account",
        "/api/",
        "/auth/",
        "/designs",
        "/phone/",
        "/saved",
        "/sign-in",
        "/upload",
        "/welcome",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
