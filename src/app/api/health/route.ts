import { NextResponse } from "next/server";
import { healthReport } from "@/lib/health";
import { headObject, isR2Configured } from "@/lib/r2";
import { createSupabasePublicClient } from "@/lib/supabase/public";

// GET /api/health: 200 when every configured dependency answers, 503 when
// one does not. Never cached, so a monitor sees the moment, not a copy.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createSupabasePublicClient();
  const report = await healthReport({
    readPublishedObjectKey: supabase
      ? async () => {
          const { data, error } = await supabase
            .from("design_files")
            .select("object_key")
            .eq("kind", "model")
            .eq("status", "ready")
            .limit(1);
          if (error) throw new Error(error.message);
          return data[0]?.object_key ?? null;
        }
      : undefined,
    objectExists: isR2Configured()
      ? async (key) => (await headObject(key)).exists
      : undefined,
  });
  return NextResponse.json(report, {
    status: report.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
