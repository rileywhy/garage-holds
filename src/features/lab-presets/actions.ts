"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { getUserId } from "@/features/holds/repository";
import {
  PRESET_LABS,
  PRESET_LIMIT,
  SEARCH_LIMIT,
  presetName,
  type LabPreset,
  type PresetLab,
} from "./saved-presets";

// Presets on the account. Reads and writes go through the signed-in user's
// client, so row-level security decides whose rows these are.

export type PresetResult = { presets: LabPreset[] } | { error: string };

type Client = SupabaseClient<Database>;
interface Row {
  id: string;
  name: string;
  search: string;
  created_at: string;
}

const SIGN_IN = "Sign in to keep presets on your account.";

function toPreset(row: Row): LabPreset {
  return {
    id: row.id,
    name: row.name,
    search: row.search,
    savedAt: row.created_at,
  };
}

async function session(): Promise<{ supabase: Client; userId: string } | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const userId = await getUserId(supabase);
  return userId ? { supabase, userId } : null;
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

function checkLab(lab: string): asserts lab is PresetLab {
  if (!PRESET_LABS.includes(lab as PresetLab)) throw new Error("Unknown lab.");
}

function checkSearch(search: string) {
  if (typeof search !== "string" || search.length > SEARCH_LIMIT)
    throw new Error("This shape is too detailed to save as a preset.");
  if (search && !search.startsWith("?"))
    throw new Error("A preset must be a lab link.");
}

async function attempt(
  work: (supabase: Client, userId: string) => Promise<LabPreset[]>,
): Promise<PresetResult> {
  const current = await session();
  if (!current) return { error: SIGN_IN };
  try {
    return { presets: await work(current.supabase, current.userId) };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

export async function listLabPresets(lab: PresetLab): Promise<PresetResult> {
  return attempt(async (supabase, userId) => {
    checkLab(lab);
    return list(supabase, userId, lab);
  });
}

// Save, or replace the preset that already carries this name.
export async function saveLabPreset(
  lab: PresetLab,
  rawName: string,
  search: string,
): Promise<PresetResult> {
  return attempt(async (supabase, userId) => {
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
    revalidatePath("/saved");
    return list(supabase, userId, lab);
  });
}

export async function renameLabPreset(
  lab: PresetLab,
  id: string,
  rawName: string,
): Promise<PresetResult> {
  return attempt(async (supabase, userId) => {
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
    revalidatePath("/saved");
    return list(supabase, userId, lab);
  });
}

export async function deleteLabPreset(
  lab: PresetLab,
  id: string,
): Promise<PresetResult> {
  return attempt(async (supabase, userId) => {
    checkLab(lab);
    const { error } = await supabase.from("lab_presets").delete().eq("id", id);
    if (error) throw new Error(`Could not delete the preset: ${error.message}`);
    revalidatePath("/saved");
    return list(supabase, userId, lab);
  });
}
