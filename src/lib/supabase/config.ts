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

// What a server action answers when called without Supabase set up. The
// pages hide the way in, so this is for a direct call, which must get a
// result rather than a thrown error.
export const ACCOUNTS_NOT_CONFIGURED =
  "Accounts aren't configured in this environment yet.";
