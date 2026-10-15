import assert from "node:assert/strict";
import { test } from "node:test";
import { SECURITY_HEADERS } from "../src/lib/security-headers";

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
