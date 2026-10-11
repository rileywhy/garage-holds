import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./config";
import type { Database } from "./database.types";

// A client with no session, for places that have no request to bind to,
// such as the sitemap. It sees exactly what a signed-out visitor sees.
export function createSupabasePublicClient() {
  const config = supabaseConfig();
  if (!config) return null;
  return createClient<Database>(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
