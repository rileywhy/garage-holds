"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { getUserId } from "@/features/holds/repository";
import {
  deleteAccountPreset,
  loadAccountPresets,
  renameAccountPreset,
  saveAccountPreset,
} from "./account-presets";
import type { LabPreset, PresetLab } from "./saved-presets";

// Presets on the account, through the signed-in user's client (see
// account-presets.ts for the rules).

export type PresetResult = { presets: LabPreset[] } | { error: string };

type Client = SupabaseClient<Database>;

const SIGN_IN = "Sign in to keep presets on your account.";

async function session(): Promise<{ supabase: Client; userId: string } | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const userId = await getUserId(supabase);
  return userId ? { supabase, userId } : null;
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
  return attempt((supabase, userId) =>
    loadAccountPresets(supabase, userId, lab),
  );
}

// Save, or replace the preset that already carries this name.
export async function saveLabPreset(
  lab: PresetLab,
  rawName: string,
  search: string,
): Promise<PresetResult> {
  return attempt(async (supabase, userId) => {
    const presets = await saveAccountPreset(
      supabase,
      userId,
      lab,
      rawName,
      search,
    );
    revalidatePath("/saved");
    return presets;
  });
}

export async function renameLabPreset(
  lab: PresetLab,
  id: string,
  rawName: string,
): Promise<PresetResult> {
  return attempt(async (supabase, userId) => {
    const presets = await renameAccountPreset(
      supabase,
      userId,
      lab,
      id,
      rawName,
    );
    revalidatePath("/saved");
    return presets;
  });
}

export async function deleteLabPreset(
  lab: PresetLab,
  id: string,
): Promise<PresetResult> {
  return attempt(async (supabase, userId) => {
    const presets = await deleteAccountPreset(supabase, userId, lab, id);
    revalidatePath("/saved");
    return presets;
  });
}
