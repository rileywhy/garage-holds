"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ACCOUNTS_NOT_CONFIGURED,
  isSupabaseConfigured,
} from "@/lib/supabase/config";
import { getUserId } from "./repository";

export type BookmarkResult = { saved: boolean } | { error: string };

export async function toggleBookmark(
  designId: string,
): Promise<BookmarkResult> {
  if (!isSupabaseConfigured()) return { error: ACCOUNTS_NOT_CONFIGURED };
  const supabase = await createSupabaseServerClient();
  const userId = await getUserId(supabase);
  if (!userId) return { error: "Sign in to save designs." };
  const { data: existing } = await supabase
    .from("bookmarks")
    .select("design_id")
    .eq("design_id", designId)
    .maybeSingle();
  const { error } = existing
    ? await supabase.from("bookmarks").delete().eq("design_id", designId)
    : await supabase
        .from("bookmarks")
        .insert({ owner_id: userId, design_id: designId });
  if (error) {
    console.error("bookmark toggle failed", { userId, designId, error });
    return { error: "Could not update your saved designs. Try again." };
  }
  revalidatePath("/", "layout");
  return { saved: !existing };
}
