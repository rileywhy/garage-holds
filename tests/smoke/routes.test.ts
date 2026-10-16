import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readdirSync } from "node:fs";
import { createServer } from "node:net";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";
import { KIND_LABELS } from "../../src/features/hold-lab/api";
import { LABS } from "../../src/features/labs/labs";

// Every route of the production build answers without a server error. The
// home page and most others render per request (cookies, Supabase), so
// `next build` never runs them; on 2026-10-16 a lab missing from a table
// crashed the home page in production and nothing in CI could see it.
//
// Run after `npm run build` (npm run test:smoke). The test starts `next start`
// on a spare port; CI sets no environment variables, so it checks the app's
// "not configured" paths. SMOKE_URL points it at a running site instead, such
// as a preview deployment; .github/workflows/deploy-smoke.yml does that after
// every Vercel deployment. VERCEL_AUTOMATION_BYPASS_SECRET, when set, is sent
// so a preview behind Vercel's deployment protection answers.

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const APP = join(ROOT, "src", "app");

// The static pages, found on disk so a new page is covered without editing
// this test, plus every lab from the one list of labs.
function staticPages(dir = APP): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory())
      return /^[[_@]/.test(entry.name)
        ? []
        : staticPages(join(dir, entry.name));
    if (!/^page\.tsx?$/.test(entry.name)) return [];
    const segments = relative(APP, dir)
      .split(sep)
      .filter((segment) => segment && !segment.startsWith("("));
    return ["/" + segments.join("/")];
  });
}

const MISSING_ID = "00000000-0000-4000-8000-000000000000";
const ROUTES = [
  ...new Set([
    ...staticPages(),
    ...LABS.map((lab) => lab.href),
    "/?q=crimp",
    "/sitemap.xml",
    "/robots.txt",
    "/api/health",
    // Dynamic pages for things that do not exist: a 404 or a redirect, never
    // a crash, including for an id that is not a UUID.
    `/holds/${MISSING_ID}`,
    `/holds/${MISSING_ID}/edit`,
    "/holds/not-a-design",
    "/phone/not-a-session",
  ]),
].sort();

const DEPLOYED = process.env.SMOKE_URL?.replace(/\/$/, "") ?? "";
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

let server: ChildProcess | undefined;
let base = DEPLOYED;
let log = "";

before(async () => {
  if (base) {
    // A protected preview redirects every request to Vercel's login, which
    // would pass the "no server error" checks without testing anything.
    const location = (await get("/")).headers.get("location") ?? "";
    assert.ok(
      !location.startsWith("https://vercel.com/sso"),
      `${base} is behind Vercel's deployment protection; set VERCEL_AUTOMATION_BYPASS_SECRET (docs/hosted-setup.md)`,
    );
    return;
  }
  const port = await sparePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [
      join(ROOT, "node_modules", "next", "dist", "bin", "next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { cwd: ROOT, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } },
  );
  server.stdout?.on("data", (chunk) => (log += chunk));
  server.stderr?.on("data", (chunk) => (log += chunk));
  await waitForServer(server);
});

after(() => server?.kill());

for (const route of ROUTES)
  test(`${route} answers without a server error`, async () => {
    const response = await get(route);
    assert.ok(
      response.status < 500,
      `${route} answered ${response.status}${serverLog()}`,
    );
  });

test("a design that does not exist is a 404", async () => {
  assert.equal((await get(`/holds/${MISSING_ID}`)).status, 404);
});

test("the home page shows a card for every lab", async () => {
  const response = await get("/");
  assert.equal(response.status, 200, serverLog());
  const html = await response.text();
  for (const lab of LABS)
    assert.ok(
      html.includes(`aria-label="Open ${lab.name}"`),
      `the home page has no card for ${lab.name}`,
    );
});

test("the sitemap lists every lab", async () => {
  const xml = await (await get("/sitemap.xml")).text();
  for (const lab of LABS)
    assert.ok(
      xml.includes(`${lab.href}</loc>`),
      `the sitemap leaves out ${lab.href}`,
    );
});

// The generators are Python functions that only Vercel runs (api/*.py), so
// next start has nothing behind these addresses; a deployed site must answer
// each with its control schema, or every lab page loads to an error.
for (const kind of Object.keys(KIND_LABELS))
  test(
    `/api/${kind} serves its generator schema`,
    { skip: !DEPLOYED && "the generators only run on a deployed site" },
    async () => {
      const response = await get(`/api/${kind}`);
      assert.equal(
        response.status,
        200,
        `/api/${kind} answered ${response.status}`,
      );
      const schema = await response.json();
      assert.ok(
        schema.defaults &&
          Array.isArray(schema.controls) &&
          schema.controls.length,
        `/api/${kind} answered without defaults and controls`,
      );
    },
  );

function get(route: string) {
  return fetch(base + route, {
    headers: BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {},
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
}

// The tail of the server's output, where a render error's stack lands.
function serverLog() {
  return log ? `\n--- next start ---\n${log.slice(-4000)}` : "";
}

function sparePort() {
  return new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("no port")),
      );
    });
  });
}

async function waitForServer(child: ChildProcess) {
  let exited = false;
  child.once("exit", () => (exited = true));
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (exited)
      throw new Error(
        `next start exited; was the app built (npm run build)?${serverLog()}`,
      );
    try {
      await fetch(`${base}/robots.txt`, { signal: AbortSignal.timeout(2000) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`next start did not answer within 60 s${serverLog()}`);
}
