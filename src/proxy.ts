import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/proxy";
import { signInPath } from "@/features/auth/redirects";
import { contentSecurityPolicy } from "@/lib/security-headers";

const SIGNED_IN_ONLY = ["/account"];

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === "development",
  );
  // Replace browser-supplied values before forwarding to the renderer. Session
  // refresh carries these headers even when it recreates the response.
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);
  const { response, userId } = await refreshSession(request);
  response.headers.set("Content-Security-Policy", csp);
  const { pathname, search } = request.nextUrl;
  const protectedPath = SIGNED_IN_ONLY.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  if (protectedPath && !userId) {
    const redirect = NextResponse.redirect(
      new URL(signInPath(pathname + search), request.nextUrl.origin),
    );
    for (const cookie of response.cookies.getAll())
      redirect.cookies.set(cookie);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }
  return response;
}

export const config = {
  // Skip Next internals and static assets; everything else may carry a session.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|stl)$).*)",
  ],
};
