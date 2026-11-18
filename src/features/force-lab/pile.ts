import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isR2Configured } from "@/lib/r2";
import {
  DEFAULT_ORIENTATION,
  isOrientation,
  type Orientation,
} from "@/features/holds/orientation";

// The published holds the force lab can load: each one's first ready STL.
// Read through the visitor's own client, so row-level security decides
// what is listed, as it does for the pile itself. The model's link is
// signed only when one is picked (freshPreviewUrl), since links expire.

export interface PileHold {
  id: string;
  title: string;
  type: string;
  fileId: string;
  orientation: Orientation;
}

const LIMIT = 300;

export async function listPileHolds(): Promise<PileHold[]> {
  if (!isSupabaseConfigured() || !isR2Configured()) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("designs")
    .select(
      "id, title, hold_type, design_files(id, kind, status, extension, orientation, position)",
    )
    .eq("status", "published")
    .order("title", { ascending: true })
    .limit(LIMIT);
  if (error || !data) return [];
  return data.flatMap((design) => {
    const file = [...(design.design_files ?? [])]
      .filter(
        (f) =>
          f.kind === "model" &&
          f.status === "ready" &&
          f.extension.toLowerCase().replace(".", "") === "stl",
      )
      .sort((a, b) => a.position - b.position)[0];
    if (!file) return [];
    return [
      {
        id: design.id,
        title: design.title,
        type: design.hold_type,
        fileId: file.id,
        orientation: isOrientation(file.orientation)
          ? file.orientation
          : DEFAULT_ORIENTATION,
      },
    ];
  });
}
