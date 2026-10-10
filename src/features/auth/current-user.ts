import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  onboarded: boolean;
}

interface ProfileRow {
  display_name: string;
  avatar_url: string | null;
  bio: string;
  onboarded_at: string | null;
}

export async function loadCurrentUser(
  supabase: SupabaseClient,
): Promise<CurrentUser | null> {
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, bio, onboarded_at")
    .eq("id", claims.sub)
    .maybeSingle<ProfileRow>();
  const email = typeof claims.email === "string" ? claims.email : "";
  return {
    id: claims.sub,
    email,
    displayName: profile?.display_name ?? email.split("@")[0] ?? "",
    avatarUrl: profile?.avatar_url ?? null,
    bio: profile?.bio ?? "",
    onboarded: Boolean(profile?.onboarded_at),
  };
}

// Verified from the session token and the profiles table; deduplicated per
// request so the layout and page can both call it.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!isSupabaseConfigured()) return null;
  return loadCurrentUser(await createSupabaseServerClient());
});
