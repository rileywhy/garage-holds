import { createSupabasePublicClient } from "@/lib/supabase/public";
import { getObject, isR2Configured } from "@/lib/r2";
import { photoContentType, photoSizeKey } from "@/features/holds/rows";

// The link-preview image of a published design: its first photo's card
// copy, served from this origin with a stable address. Chat and social
// scrapers re-fetch previews long after a link is posted, so this cannot
// be a signed R2 URL, which expires after an hour. Reads as a signed-out
// visitor, so drafts answer 404 like any other missing page.

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createSupabasePublicClient();
  if (!supabase || !isR2Configured() || !UUID.test(id)) return notFound();
  const { data } = await supabase
    .from("designs")
    .select("id, design_files(kind, status, position, object_key, extension)")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();
  const photo = (data?.design_files ?? [])
    .filter((file) => file.kind === "photo" && file.status === "ready")
    .sort((a, b) => a.position - b.position)[0];
  const contentType = photo ? photoContentType(photo.extension) : null;
  if (!photo || !contentType) return notFound();
  const body = await cardOrOriginal(photo.object_key);
  if (!body) return notFound();
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      // The address carries the photo id, so a replaced photo is a new URL
      // and the old one can be cached for a day.
      "Cache-Control":
        "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// The card copy is made shortly after upload; until then, or if it is
// missing, the original still makes a preview.
async function cardOrOriginal(objectKey: string) {
  for (const key of [photoSizeKey(objectKey, "card"), objectKey]) {
    try {
      return await getObject(key);
    } catch {
      continue;
    }
  }
  return null;
}

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
