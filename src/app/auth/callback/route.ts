import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  postSignInPath,
  safeNextPath,
  signInPath,
} from "@/features/auth/redirects";
import { loadCurrentUser } from "@/features/auth/current-user";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requestOrigin } from "@/lib/request-origin";

// Google (PKCE) returns here with a one-time code; exchanging it sets the
// session cookies before we send the user on to their destination.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  // Built from the Host header so the redirect lands on the same host the
  // cookies were set for (request.url can read "localhost" behind a server).
  const origin = await requestOrigin();
  if (code && isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const user = await loadCurrentUser(supabase);
      return NextResponse.redirect(
        new URL(postSignInPath(user?.onboarded ?? true, next), origin),
      );
    }
  }
  return NextResponse.redirect(
    new URL(
      `${signInPath(next)}${next === "/" ? "?" : "&"}error=google`,
      origin,
    ),
  );
}
