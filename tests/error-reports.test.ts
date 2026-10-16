import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  CLIENT_ROUTES,
  clipMessage,
  createAlertLimiter,
  describeError,
  escapeSlack,
  formatClientError,
  formatServerError,
  plainLine,
  redactClientPath,
  redactPath,
  serverErrorKey,
  validateClientReport,
} from "../src/lib/error-reports";

test("the limiter sends one line per key per window", () => {
  let now = 1_000;
  const allow = createAlertLimiter(60_000, () => now);
  assert.equal(allow("a"), true);
  assert.equal(allow("a"), false);
  assert.equal(allow("b"), true);
  now += 59_999;
  assert.equal(allow("a"), false);
  now += 1;
  assert.equal(allow("a"), true);
});

test("server lines carry the route template, not ids or query strings", () => {
  const error = Object.assign(new Error("boom"), { digest: "123" });
  const line = formatServerError(
    error,
    { path: "/phone/secret-session?token=abc", method: "POST" },
    { routePath: "/phone/[session]", routeType: "action" },
  );
  assert.equal(
    line,
    "Server error in action POST /phone/[session]: Error: boom [digest 123]",
  );
  assert.equal(redactPath("/holds/abc?x=1", "/holds/[id]"), "/holds/[id]");
  assert.equal(redactPath("/upload?x=1", "/upload"), "/upload");
  assert.equal(redactPath("/a/b/c", "/a/[x]"), "/a/[x]");
  assert.equal(redactPath("/index.rsc", "/"), "/");
});

test("the same error on the same route shares one key", () => {
  const context = { routePath: "/holds/[id]", routeType: "render" };
  const one = serverErrorKey(new TypeError("x is undefined"), context);
  const two = serverErrorKey(new TypeError("x is undefined"), context);
  const other = serverErrorKey(new TypeError("y is undefined"), context);
  assert.equal(one, two);
  assert.notEqual(one, other);
});

test("thrown values that are not errors are still described", () => {
  assert.deepEqual(describeError("plain string"), {
    name: "Error",
    message: "plain string",
  });
  assert.equal(describeError(new Error("x".repeat(600))).message.length, 500);
});

test("client reports are validated and clipped before use", () => {
  assert.equal(validateClientReport(null), null);
  assert.equal(validateClientReport("boom"), null);
  assert.equal(validateClientReport({ message: "", digest: "" }), null);
  assert.equal(
    validateClientReport({ message: "x", digest: "not a digest!" }),
    null,
  );
  assert.equal(
    validateClientReport({ message: "x", path: "https://evil.example" }),
    null,
  );
  const report = validateClientReport({
    message: "y".repeat(600),
    digest: "abc-123",
    path: "/holds/abc?secret=1",
    extra: "ignored",
  });
  assert.ok(report);
  assert.equal(report.message.length, 500);
  assert.equal(report.digest, "abc-123");
  assert.equal(report.path, "/holds/[id]");
  assert.equal(
    formatClientError({ message: "boom", digest: "d1", path: "/upload" }),
    "Client error on /upload: boom [digest d1]",
  );
  assert.equal(
    formatClientError({ message: "", digest: "d1", path: "" }),
    "Client error on an unknown page: an error with no message [digest d1]",
  );
});

test("client reports are one plain line with no markdown or mentions", () => {
  assert.equal(
    plainLine(
      "line one\n\n**bold** [link](https://x) `code` @everyone <!channel> #ping",
    ),
    "line one bold link(https://x) code everyone !channel ping",
  );
  const report = validateClientReport({
    message: "a\r\nb\tc",
    digest: "",
    path: "/upload",
  });
  assert.equal(report?.message, "a b c");
});

test("client paths are reduced to their route template", () => {
  assert.equal(redactClientPath("/phone/secret-session"), "/phone/[session]");
  assert.equal(redactClientPath("/holds/abc/edit?x=1"), "/holds/[id]/edit");
  assert.equal(redactClientPath("/holds/abc/"), "/holds/[id]");
  assert.equal(redactClientPath("/make/crimp"), "/make/crimp");
  assert.equal(redactClientPath("/"), "/");
  assert.equal(redactClientPath("/nowhere/with/a/token"), "/nowhere/[…]");
  assert.equal(redactClientPath("/nowhere"), "/nowhere/[…]");
});

test("the route list matches the pages under src/app", () => {
  const found: string[] = [];
  const walk = (dir: string, route: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, `${route}/${name}`);
      else if (name === "page.tsx") found.push(route || "/");
    }
  };
  walk("src/app", "");
  assert.deepEqual(found.sort(), [...CLIENT_ROUTES].sort());
});

test("webhook lines are clipped and escaped for Slack", () => {
  assert.equal(clipMessage("x".repeat(2500)).length, 1900);
  assert.equal(clipMessage("short"), "short");
  assert.equal(
    escapeSlack("a < b & <!channel>"),
    "a &lt; b &amp; &lt;!channel&gt;",
  );
});
