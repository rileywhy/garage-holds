import "./support/stub-server-only";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, test } from "node:test";

// The cron route behind the storage sweep (vercel.json). It deletes rows and
// objects, so its refusals are what keep it closed to everyone but Vercel
// Cron. Nothing here reaches a real database or bucket.

const { GET } = await import("../src/app/api/sweep/route");

const SECRET = "test-cron-secret-0123456789";
// Shaped like real settings so the configuration checks pass. The database
// URL is replaced by a local stand-in where a request gets that far.
const CONFIGURED = {
  CRON_SECRET: SECRET,
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_SECRET_ACCESS_KEY: "test-secret-key",
  R2_BUCKET_NAME: "test-bucket",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  SUPABASE_SECRET_KEY: "test-secret-key",
};

const saved = { ...process.env };
beforeEach(() => {
  for (const name of Object.keys(CONFIGURED)) delete process.env[name];
});
afterEach(() => {
  for (const name of Object.keys(CONFIGURED)) delete process.env[name];
  Object.assign(process.env, saved);
});

function call(authorization?: string) {
  return GET(
    new Request("http://localhost/api/sweep?dry=1", {
      headers: authorization ? { authorization } : {},
    }),
  );
}

test("the sweep answers 503 until the secret, R2 and Supabase are all set", async () => {
  const missing = [
    "CRON_SECRET",
    "R2_BUCKET_NAME",
    "SUPABASE_SECRET_KEY",
  ] as const;
  for (const name of missing) {
    Object.assign(process.env, CONFIGURED);
    delete process.env[name];
    const response = await call(`Bearer ${SECRET}`);
    assert.equal(response.status, 503, `${name} unset`);
    assert.deepEqual(await response.json(), {
      error: "The storage sweep is not configured.",
    });
  }
});

test("the sweep answers 401 to a missing or wrong bearer token", async () => {
  Object.assign(process.env, CONFIGURED);
  for (const authorization of [
    undefined,
    SECRET,
    `Bearer ${SECRET.slice(0, -1)}`,
    `Bearer ${SECRET.slice(0, -1)}x`,
    `bearer ${SECRET}`,
    `Bearer ${SECRET}${SECRET}`,
    "Bearer ",
  ]) {
    const response = await call(authorization);
    assert.equal(response.status, 401, String(authorization));
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  }
});

test("the right token starts the sweep", async () => {
  // A stand-in database that refuses every query, so the sweep stops at its
  // first read and the bucket is never contacted.
  const asked: string[] = [];
  const database = createServer((request, response) => {
    asked.push(request.url ?? "");
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ message: "stand-in database" }));
  });
  await new Promise<void>((resolve) =>
    database.listen(0, "127.0.0.1", resolve),
  );
  const { port } = database.address() as AddressInfo;
  Object.assign(process.env, CONFIGURED, {
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${port}`,
  });
  const quiet = console.error;
  console.error = () => {};
  try {
    const response = await call(`Bearer ${SECRET}`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: "The sweep did not finish. See the server log.",
    });
    assert.equal(asked.length, 1);
    assert.match(asked[0], /^\/rest\/v1\/designs\?/);
  } finally {
    console.error = quiet;
    database.close();
  }
});
