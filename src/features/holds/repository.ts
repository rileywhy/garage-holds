import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isR2Configured, signDownload, signImage } from "@/lib/r2";
import {
  designRowToHold,
  PHOTO_SIZES,
  photoContentType,
  photoSizeKey,
  reviewRowToReview,
  type DesignRow,
  type PhotoSize,
  type ReviewRow,
} from "./rows";
import {
  applyCatalogQuery,
  CATALOG_PAGE_SIZE,
  DEFAULT_CATALOG_QUERY,
  pageCount,
  type CatalogQuery,
} from "./catalog-query";
import type { Hold, HoldType, Review } from "./types";

// Reads go through the user's own client, so row-level security decides what
// is visible: published designs for everyone, drafts only for their owner.

// Profiles are named through their foreign key: bookmarks also connect designs
// and profiles, and PostgREST refuses an ambiguous embed. Review ratings come
// along so a page of cards needs no second query.
const DESIGN_SELECT =
  "*, profiles!designs_owner_id_fkey(display_name), design_files(*), reviews(rating)";
const REVIEW_SELECT = "*, profiles!reviews_author_id_fkey(display_name)";

// PostgREST's answer to a page past the end.
const RANGE_NOT_SATISFIABLE = "PGRST103";

async function client() {
  return isSupabaseConfigured() ? createSupabaseServerClient() : null;
}

// One page of the catalog, filtered, searched and sorted by the database.
export interface CatalogPage {
  holds: Hold[];
  // Designs matching the query, across every page.
  total: number;
  page: number;
  pageCount: number;
}

const EMPTY_PAGE: CatalogPage = { holds: [], total: 0, page: 1, pageCount: 1 };

export async function listPublishedHolds(
  query: CatalogQuery = DEFAULT_CATALOG_QUERY,
): Promise<CatalogPage> {
  const supabase = await client();
  if (!supabase) return EMPTY_PAGE;
  return catalogPage(supabase, query, "Could not load the library");
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

// The saved designs, through the same filters and pages as the catalog.
export async function listSavedHolds(
  query: CatalogQuery = DEFAULT_CATALOG_QUERY,
): Promise<CatalogPage> {
  const supabase = await client();
  if (!supabase) return EMPTY_PAGE;
  const ids = await listSavedIds();
  if (!ids.length) return EMPTY_PAGE;
  return catalogPage(supabase, query, "Could not load saved designs", ids);
}

// Published designs of each type, for the filter sidebar's counts.
export async function countPublishedByType(): Promise<
  Partial<Record<HoldType, number>>
> {
  const supabase = await client();
  if (!supabase) return {};
  const { data, error } = await supabase
    .from("catalog_type_counts")
    .select("hold_type, designs");
  if (error) throw new Error(`Could not count the library: ${error.message}`);
  const counts: Partial<Record<HoldType, number>> = {};
  for (const row of data)
    if (row.hold_type) counts[row.hold_type as HoldType] = row.designs ?? 0;
  return counts;
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

async function catalogPage(
  supabase: NonNullable<Awaited<ReturnType<typeof client>>>,
  query: CatalogQuery,
  failure: string,
  withinIds?: string[],
): Promise<CatalogPage> {
  const from = (query.page - 1) * CATALOG_PAGE_SIZE;
  const { data, error, count } = await applyCatalogQuery(
    supabase.from("designs").select(DESIGN_SELECT, { count: "exact" }),
    query,
    withinIds,
  ).range(from, from + CATALOG_PAGE_SIZE - 1);
  if (error?.code === RANGE_NOT_SATISFIABLE) {
    // A page past the end, from an old link or a catalog that shrank: the
    // page stays empty and the count says where the last page is.
    const { count: total } = await applyCatalogQuery(
      supabase.from("designs").select("id", { count: "exact", head: true }),
      query,
      withinIds,
    );
    return {
      holds: [],
      total: total ?? 0,
      page: query.page,
      pageCount: pageCount(total ?? 0),
    };
  }
  if (error) throw new Error(`${failure}: ${error.message}`);
  return {
    holds: await toHolds(rows<DesignRow>(data)),
    total: count ?? 0,
    page: query.page,
    pageCount: pageCount(count ?? 0),
  };
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
            if (file.kind !== "photo" || !imageType) {
              urls.set(file.id, await signDownload(file.object_key, file.name));
              if (file.preview_object_key)
                urls.set(
                  `${file.id}:preview`,
                  await signDownload(file.preview_object_key, file.name),
                );
              return;
            }
            urls.set(file.id, await signImage(file.object_key, imageType));
            for (const size of Object.keys(PHOTO_SIZES) as PhotoSize[])
              urls.set(
                `${file.id}:${size}`,
                await signImage(photoSizeKey(file.object_key, size), imageType),
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
