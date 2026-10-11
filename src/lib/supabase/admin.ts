import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./config";
import type { Database } from "./database.types";

// Bypasses row-level security. Used only where the server must record a fact
// users cannot be trusted to assert themselves, such as "this file exists in
// R2 with this size". Every call site checks ownership with the user's own
// client first.
let admin: SupabaseClient<Database> | undefined;

export function isSupabaseAdminConfigured() {
  return Boolean(supabaseConfig() && process.env.SUPABASE_SECRET_KEY);
}

export function createSupabaseAdminClient() {
  if (admin) return admin;
  const config = supabaseConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!config || !secretKey)
    throw new Error("Supabase server credentials are not configured.");
  admin = createClient<Database>(config.url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
