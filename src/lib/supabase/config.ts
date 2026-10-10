// Public Supabase settings. Both values are safe for browsers; row-level
// security, not key secrecy, protects data. Server-only secrets never live here.
export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  return url && publishableKey ? { url, publishableKey } : null;
}

export function isSupabaseConfigured() {
  return supabaseConfig() !== null;
}
