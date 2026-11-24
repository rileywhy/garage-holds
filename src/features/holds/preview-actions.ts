"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isR2Configured, signDownload } from "@/lib/r2";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A fresh link to the model a preview draws, for a page whose own link has
// expired (see model-fetch.ts). The file is read through the visitor's own
// client, so row-level security decides whether they may have it: the same
// files, and the same links, the page would get on a reload.
export async function freshPreviewUrl(fileId: string): Promise<string | null> {
  if (typeof fileId !== "string" || !UUID.test(fileId)) return null;
  if (!isSupabaseConfigured() || !isR2Configured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data: file } = await supabase
    .from("design_files")
    .select("name, object_key, preview_object_key")
    .eq("id", fileId)
    .eq("kind", "model")
    .eq("status", "ready")
    .maybeSingle();
  if (!file) return null;
  return signDownload(file.preview_object_key || file.object_key, file.name);
}
