import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { UploadLimits, UploadUsage } from "./allowance";

export interface Allowance {
  usage: UploadUsage;
  limits: UploadLimits;
}

// What the account holds and what it may hold, read as the user: drafts
// count, since their files are already in the bucket.
export async function loadAllowance(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Allowance> {
  const [{ data: profile }, { data: designs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("upload_limit_designs, upload_limit_bytes")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("designs")
      .select("id, design_files(bytes)")
      .eq("owner_id", userId),
  ]);
  const rows = designs ?? [];
  return {
    usage: {
      designs: rows.length,
      bytes: rows.reduce(
        (sum, design) =>
          sum + design.design_files.reduce((total, f) => total + f.bytes, 0),
        0,
      ),
    },
    limits: {
      designs: profile?.upload_limit_designs ?? 0,
      bytes: profile?.upload_limit_bytes ?? 0,
    },
  };
}

// Shown to people who hit a limit, so they know who to ask.
export function contactEmail() {
  return process.env.NEXT_PUBLIC_CONTACT_EMAIL || null;
}
