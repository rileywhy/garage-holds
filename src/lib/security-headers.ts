import { createHash } from "node:crypto";
import { THEME_INITIALIZATION_SCRIPT } from "./theme";

// Baseline response headers for every route (RIL-84). Vercel adds HSTS at
// the edge, so it is not repeated here.
//
// form-action is left out on purpose: browsers apply it to the redirect
// that follows a form submit, and nothing here needs it.
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

// Next adds this request's nonce to its inline bootstrap and streaming scripts.
// The fixed theme hash also covers the independent global-error document.
const themeHash = createHash("sha256")
  .update(THEME_INITIALIZATION_SCRIPT)
  .digest("base64");

// Google Identity Services, for the sign-in button: its script, the
// stylesheet it injects, and the iframes that draw the button and popup.
const GOOGLE_SIGN_IN = "https://accounts.google.com/gsi/";

export function contentSecurityPolicy(nonce: string, development = false) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'sha256-${themeHash}' https://va.vercel-scripts.com ${GOOGLE_SIGN_IN}client${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline' ${GOOGLE_SIGN_IN}style`,
    `frame-src ${GOOGLE_SIGN_IN}`,
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    // Signed R2 URLs and Supabase's project host vary by deployment.
    `connect-src 'self' https:${development ? " http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*" : ""}`,
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}
