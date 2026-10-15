import assert from "node:assert/strict";
import { test } from "node:test";
import { healthReport } from "../src/lib/health";

const quiet = async (run: () => Promise<unknown>) => {
  const error = console.error;
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.error = error;
  }
};

test("every configured dependency answering is healthy", async () => {
  const report = await healthReport({
    readPublishedObjectKey: async () => "designs/d/f.stl",
    objectExists: async (key) => key === "designs/d/f.stl",
  });
  assert.deepEqual(report, { ok: true, checks: { supabase: "ok", r2: "ok" } });
});

test("a missing object or a failing read is unhealthy", async () => {
  const gone = await healthReport({
    readPublishedObjectKey: async () => "designs/d/f.stl",
    objectExists: async () => false,
  });
  assert.equal(gone.ok, false);
  assert.equal(gone.checks.r2, "failed");
  const down = (await quiet(() =>
    healthReport({
      readPublishedObjectKey: async () => {
        throw new Error("fetch failed");
      },
      objectExists: async () => true,
    }),
  )) as Awaited<ReturnType<typeof healthReport>>;
  assert.equal(down.ok, false);
  assert.deepEqual(down.checks, { supabase: "failed", r2: "skipped" });
});

test("what is not configured, or has nothing to check, is skipped", async () => {
  assert.deepEqual(await healthReport({}), {
    ok: true,
    checks: { supabase: "skipped", r2: "skipped" },
  });
  const empty = await healthReport({
    readPublishedObjectKey: async () => null,
    objectExists: async () => true,
  });
  assert.deepEqual(empty.checks, { supabase: "ok", r2: "skipped" });
});
