import { headers } from "next/headers";

// The public origin of the current request, honoring the proxy headers Vercel
// sets, so auth redirects return to the host the user is actually on.
export async function requestOrigin() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (origin) return origin;
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) throw new Error("Could not determine the request origin.");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${protocol}://${host}`;
}
