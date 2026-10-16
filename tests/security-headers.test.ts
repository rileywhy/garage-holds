import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SECURITY_HEADERS,
  contentSecurityPolicy,
} from "../src/lib/security-headers";

test("every response carries the baseline security headers", () => {
  const headers = Object.fromEntries(
    SECURITY_HEADERS.map(({ key, value }) => [key, value]),
  );
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.match(headers["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.match(headers["Content-Security-Policy"], /base-uri 'self'/);
  // A form-action directive would block the redirect to Google after the
  // sign-in form is submitted.
  assert.doesNotMatch(headers["Content-Security-Policy"], /form-action/);
});

test("page CSP allows only nonce-bearing inline scripts and the fixed theme", () => {
  const policy = contentSecurityPolicy("request-one");
  const scripts = policy.split("; ").find((p) => p.startsWith("script-src "))!;
  assert.match(scripts, /'nonce-request-one'/);
  assert.match(scripts, /'sha256-[A-Za-z0-9+/=]+'/);
  assert.doesNotMatch(scripts, /unsafe-inline|unsafe-eval/);
  assert.doesNotMatch(
    contentSecurityPolicy("request-two"),
    /nonce-request-one/,
  );
  assert.match(contentSecurityPolicy("dev", true), /'unsafe-eval'/);
  assert.match(policy, /connect-src 'self' https:/);
  assert.match(policy, /img-src 'self' data: blob: https:/);
  assert.doesNotMatch(policy, /form-action/);
});
