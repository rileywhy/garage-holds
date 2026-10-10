import assert from "node:assert/strict";
import { test } from "node:test";
import { safeNextPath, signInPath } from "../src/features/auth/redirects";
import {
  normalizeDisplayName,
  validateDisplayName,
} from "../src/features/profiles/validation";

test("post-sign-in redirects stay on this site", () => {
  assert.equal(safeNextPath("/upload"), "/upload");
  assert.equal(safeNextPath("/holds/abc?tab=files"), "/holds/abc?tab=files");
  assert.equal(safeNextPath("https://evil.example"), "/");
  assert.equal(safeNextPath("//evil.example/path"), "/");
  assert.equal(safeNextPath("/\\evil.example"), "/");
  assert.equal(safeNextPath("/sign-in?next=/account"), "/");
  assert.equal(safeNextPath(""), "/");
  assert.equal(safeNextPath(null, "/account"), "/account");
});

test("sign-in links only carry a destination when it is not home", () => {
  assert.equal(signInPath("/"), "/sign-in");
  assert.equal(signInPath(null), "/sign-in");
  assert.equal(signInPath("/account"), "/sign-in?next=%2Faccount");
  assert.equal(signInPath("https://evil.example"), "/sign-in");
});

test("display names are trimmed and whitespace-collapsed", () => {
  assert.equal(normalizeDisplayName("  Riley   Young "), "Riley Young");
});

test("display names accept everyday names and reject the rest", () => {
  for (const name of ["Riley", "riley_y", "Mesa Edge 3D", "Zoë-Ann", "山田"])
    assert.deepEqual(validateDisplayName(name), [], name);
  assert.equal(validateDisplayName("R").length, 1);
  assert.equal(validateDisplayName("x".repeat(51)).length, 1);
  assert.equal(validateDisplayName("-leading").length, 1);
  assert.equal(validateDisplayName("riley@home").length, 1);
  assert.equal(validateDisplayName("<script>").length, 1);
});
