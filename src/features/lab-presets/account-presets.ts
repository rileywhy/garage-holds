import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  PRESET_LABS,
  PRESET_LIMIT,
  SEARCH_LIMIT,
  presetName,
  type LabPreset,
  type PresetLab,
} from "./saved-presets";

// Presets on the account, under the same rules as the browser store in
// saved-presets.ts. Every query runs as the signed-in user, so row-level
// security decides whose rows these are. The limit per lab and one name per
// lab are kept here only: the table does not enforce them (RIL-74).
//
// The client is passed in so the integration tests can run these as a real
// signed-in user; actions.ts binds the request's own client.

type Client = SupabaseClient<Database>;

interface Row {
  id: string;
  name: string;
  search: string;
  created_at: string;
}

function toPreset(row: Row): LabPreset {
  return {
    id: row.id,
    name: row.name,
    search: row.search,
    savedAt: row.created_at,
  };
}

function checkLab(lab: string): asserts lab is PresetLab {
  if (!PRESET_LABS.includes(lab as PresetLab)) throw new Error("Unknown lab.");
}

function checkSearch(search: string) {
  if (typeof search !== "string" || search.length > SEARCH_LIMIT)
    throw new Error("This shape is too detailed to save as a preset.");
  if (search && !search.startsWith("?"))
    throw new Error("A preset must be a lab link.");
}

async function list(supabase: Client, userId: string, lab: PresetLab) {
  const { data, error } = await supabase
    .from("lab_presets")
    .select("id, name, search, created_at")
    .eq("owner_id", userId)
    .eq("lab", lab)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load your presets: ${error.message}`);
  return ((data ?? []) as Row[]).map(toPreset);
}

export async function loadAccountPresets(
  supabase: Client,
  userId: string,
  lab: PresetLab,
): Promise<LabPreset[]> {
  checkLab(lab);
  return list(supabase, userId, lab);
}

// Save, or replace the preset that already carries this name.
export async function saveAccountPreset(
  supabase: Client,
  userId: string,
  lab: PresetLab,
  rawName: string,
  search: string,
): Promise<LabPreset[]> {
  checkLab(lab);
  checkSearch(search);
  const name = presetName(rawName);
  const existing = await list(supabase, userId, lab);
  const same = existing.find(
    (p) => p.name.toLowerCase() === name.toLowerCase(),
  );
  if (same) {
    const { error } = await supabase
      .from("lab_presets")
      .update({ name, search })
      .eq("id", same.id);
    if (error) throw new Error(`Could not save the preset: ${error.message}`);
  } else {
    if (existing.length >= PRESET_LIMIT)
      throw new Error(
        `You have ${PRESET_LIMIT} presets in this lab. Delete one to make room.`,
      );
    const { error } = await supabase
      .from("lab_presets")
      .insert({ owner_id: userId, lab, name, search });
    if (error) throw new Error(`Could not save the preset: ${error.message}`);
  }
  return list(supabase, userId, lab);
}

export async function renameAccountPreset(
  supabase: Client,
  userId: string,
  lab: PresetLab,
  id: string,
  rawName: string,
): Promise<LabPreset[]> {
  checkLab(lab);
  const name = presetName(rawName);
  const existing = await list(supabase, userId, lab);
  if (
    existing.some(
      (p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase(),
    )
  )
    throw new Error(`You already have a preset called “${name}”.`);
  const { error } = await supabase
    .from("lab_presets")
    .update({ name })
    .eq("id", id);
  if (error) throw new Error(`Could not rename the preset: ${error.message}`);
  return list(supabase, userId, lab);
}

export async function deleteAccountPreset(
  supabase: Client,
  userId: string,
  lab: PresetLab,
  id: string,
): Promise<LabPreset[]> {
  checkLab(lab);
  const { error } = await supabase.from("lab_presets").delete().eq("id", id);
  if (error) throw new Error(`Could not delete the preset: ${error.message}`);
  return list(supabase, userId, lab);
}
