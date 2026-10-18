import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { isR2Configured } from "@/lib/r2";
import { scrubStoredPhotos, sweepStorage } from "@/features/uploads/sweep";

// Vercel Cron calls this on the schedule in vercel.json with
// `Authorization: Bearer <CRON_SECRET>`. `?dry=1` reports without deleting.
// Each run also strips metadata from any photo original that still has it
// (photo-scrub.ts).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !isR2Configured() || !isSupabaseAdminConfigured())
    return NextResponse.json(
      { error: "The storage sweep is not configured." },
      { status: 503 },
    );
  if (!authorized(request.headers.get("authorization"), secret))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dryRun = new URL(request.url).searchParams.get("dry") === "1";
  try {
    const report = await sweepStorage({ dryRun });
    const scrub = await scrubStoredPhotos({ dryRun });
    return NextResponse.json({ ...report, scrub });
  } catch (error) {
    console.error("storage sweep failed", error);
    return NextResponse.json(
      { error: "The sweep did not finish. See the server log." },
      { status: 500 },
    );
  }
}

function authorized(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
