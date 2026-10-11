import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isR2Configured, signDownload, signImage } from "@/lib/r2";
import {
  designRowToHold,
  photoContentType,
  reviewRowToReview,
  type DesignRow,
  type ReviewRow,
} from "./rows";
import type { Hold, Review } from "./types";

// Reads go through the user's own client, so row-level security decides what
// is visible: published designs for everyone, drafts only for their owner.

// Profiles are named through their foreign key: bookmarks also connect designs
// and profiles, and PostgREST refuses an ambiguous embed.
const DESIGN_SELECT =
  "*, profiles!designs_owner_id_fkey(display_name), design_files(*)";
const REVIEW_SELECT = "*, profiles!reviews_author_id_fkey(display_name)";

async function client() {
  return isSupabaseConfigured() ? createSupabaseServerClient() : null;
}

export async function listPublishedHolds(): Promise<Hold[]> {
  const supabase = await client();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("designs")
    .select(DESIGN_SELECT)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) throw new Error(`Could not load the library: ${error.message}`);
  return toHolds(rows<DesignRow>(data));
}

export async function getHold(id: string): Promise<Hold | null> {
  const supabase = await client();
  if (!supabase || !isUuid(id)) return null;
  const { data, error } = await supabase
    .from("designs")
    .select(DESIGN_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load this design: ${error.message}`);
  return data ? (await toHolds(rows<DesignRow>([data])))[0] : null;
}

export async function listOwnHolds(ownerId: string): Promise<Hold[]> {
  const supabase = await client();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("designs")
    .select(DESIGN_SELECT)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load your designs: ${error.message}`);
  return toHolds(rows<DesignRow>(data));
}

export async function listSavedIds(): Promise<string[]> {
  const supabase = await client();
  if (!supabase) return [];
  const { data } = await supabase.from("bookmarks").select("design_id");
  return rows<{ design_id: string }>(data).map((row) => row.design_id);
}

export async function listSavedHolds(): Promise<Hold[]> {
  const supabase = await client();
  if (!supabase) return [];
  const ids = await listSavedIds();
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("designs")
    .select(DESIGN_SELECT)
    .in("id", ids)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load saved designs: ${error.message}`);
  return toHolds(rows<DesignRow>(data));
}

export async function listReviews(designId?: string): Promise<Review[]> {
  const supabase = await client();
  if (!supabase) return [];
  let query = supabase
    .from("reviews")
    .select(REVIEW_SELECT)
    .order("created_at", { ascending: false });
  if (designId) query = query.eq("design_id", designId);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load reviews: ${error.message}`);
  return rows<ReviewRow>(data).map(reviewRowToReview);
}

export async function getUserId(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ?? null;
}

async function toHolds(rows: DesignRow[]): Promise<Hold[]> {
  const urls = new Map<string, string>();
  if (isR2Configured()) {
    await Promise.all(
      rows.flatMap((row) =>
        row.design_files
          .filter((file) => file.status === "ready")
          .map(async (file) => {
            const imageType = photoContentType(file.extension);
            urls.set(
              file.id,
              file.kind === "photo" && imageType
                ? await signImage(file.object_key, imageType)
                : await signDownload(file.object_key, file.name),
            );
          }),
      ),
    );
  }
  return rows.map((row) => designRowToHold(row, urls));
}

// PostgREST embeds come back as the generated column types; the narrowed
// domain row shapes are asserted here, next to the queries that produce them.
function rows<T>(data: unknown): T[] {
  return (data ?? []) as T[];
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
