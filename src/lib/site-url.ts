// The public address of the site, for absolute URLs in the sitemap and in
// link previews. Vercel sets VERCEL_PROJECT_PRODUCTION_URL on every deploy;
// NEXT_PUBLIC_SITE_URL overrides it once there is a custom domain.
export function siteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined);
  return (configured ?? "http://127.0.0.1:3000").replace(/\/$/, "");
}
