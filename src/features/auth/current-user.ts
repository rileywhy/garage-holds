import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

// Verified from the session token and the profiles table; deduplicated per
// request so the layout and page can both call it.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", claims.sub)
    .maybeSingle<{ display_name: string; avatar_url: string | null }>();
  const email = typeof claims.email === "string" ? claims.email : "";
  return {
    id: claims.sub,
    email,
    displayName: profile?.display_name ?? email.split("@")[0] ?? "",
    avatarUrl: profile?.avatar_url ?? null,
  };
});
