// The health report behind /api/health, for an outside monitor. A page
// render can answer 200 with Supabase or R2 broken (signing happens
// locally and the catalog degrades quietly), so the report asks each
// dependency a real question: can the public client read a published
// model file's row, and does that object answer a HEAD in the bucket.
// The dependencies are passed in so the report can be tested without them.

export type CheckResult = "ok" | "failed" | "skipped";

export interface HealthReport {
  ok: boolean;
  checks: { supabase: CheckResult; r2: CheckResult };
}

export interface HealthDeps {
  // A published, ready model file's object key, or null when there is
  // none to look at; undefined when Supabase is not configured.
  readPublishedObjectKey?: () => Promise<string | null>;
  // Whether the object exists in the bucket; undefined when R2 is not
  // configured.
  objectExists?: (key: string) => Promise<boolean>;
}

export async function healthReport(deps: HealthDeps): Promise<HealthReport> {
  let supabase: CheckResult = "skipped";
  let r2: CheckResult = "skipped";
  let key: string | null = null;
  if (deps.readPublishedObjectKey)
    try {
      key = await deps.readPublishedObjectKey();
      supabase = "ok";
    } catch (error) {
      console.error("health: supabase check failed", error);
      supabase = "failed";
    }
  if (deps.objectExists && key)
    try {
      r2 = (await deps.objectExists(key)) ? "ok" : "failed";
    } catch (error) {
      console.error("health: r2 check failed", error);
      r2 = "failed";
    }
  return {
    ok: supabase !== "failed" && r2 !== "failed",
    checks: { supabase, r2 },
  };
}
