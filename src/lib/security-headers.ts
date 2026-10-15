// Baseline response headers for every route (RIL-84). Vercel adds HSTS at
// the edge, so it is not repeated here.
//
// The Content-Security-Policy carries only the directives that cannot break
// a page. A script-src policy needs a per-request nonce for the theme script
// in the root layout and for Next's own inline scripts, plus the R2 and
// Supabase hosts for images and requests; that is a pass of its own.
// form-action is left out on purpose: browsers apply it to the redirect
// that follows a form submit, which is how Google sign-in leaves the site.
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
];
