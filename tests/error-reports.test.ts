import test from "node:test";
import assert from "node:assert/strict";
import {
  createAlertLimiter,
  describeError,
  formatClientError,
  formatServerError,
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
  assert.equal(report.path, "/holds/abc");
  assert.equal(
    formatClientError({ message: "boom", digest: "d1", path: "/upload" }),
    "Client error on /upload: boom [digest d1]",
  );
  assert.equal(
    formatClientError({ message: "", digest: "d1", path: "" }),
    "Client error on an unknown page: an error with no message [digest d1]",
  );
});
