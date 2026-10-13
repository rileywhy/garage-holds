import type { MetadataRoute } from "next";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { siteUrl } from "@/lib/site-url";

// The home page and every published design. Reads as a signed-out visitor,
// so drafts never appear. Refreshed at most hourly.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const entries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/make/crimp`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/make/sloper`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/make/jug`, changeFrequency: "monthly", priority: 0.6 },
    {
      url: `${base}/how-to-3d-print-climbing-holds`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
  const supabase = createSupabasePublicClient();
  if (!supabase) return entries;
  const { data } = await supabase
    .from("designs")
    .select("id, updated_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  for (const design of data ?? [])
    entries.push({
      url: `${base}/holds/${design.id}`,
      lastModified: design.updated_at,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  return entries;
}
