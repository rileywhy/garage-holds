import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserId } from "@/features/holds/repository";
import type { LabPreset, PresetLab } from "./saved-presets";

export interface AccountPreset extends LabPreset {
  lab: PresetLab;
}

// Every preset on the signed-in account, newest first, for the Saved page.
export async function listAccountPresets(): Promise<AccountPreset[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createSupabaseServerClient();
  const userId = await getUserId(supabase);
  if (!userId) return [];
  const { data, error } = await supabase
    .from("lab_presets")
    .select("id, lab, name, search, created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load lab presets: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    lab: row.lab as PresetLab,
    name: row.name,
    search: row.search,
    savedAt: row.created_at,
  }));
}
