// The public address of the site, for absolute URLs in the sitemap and in
// link previews. Vercel sets VERCEL_PROJECT_PRODUCTION_URL on every deploy;
// NEXT_PUBLIC_SITE_URL overrides it once there is a custom domain.
// An empty value counts as unset: a copied .env.example leaves the line
// blank, and `new URL("")` would throw in the root layout.
export function siteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "");
  return (configured || "http://127.0.0.1:3000").replace(/\/$/, "");
}
