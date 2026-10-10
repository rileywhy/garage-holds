import assert from "node:assert/strict";
import { test } from "node:test";
import {
  postSignInPath,
  safeNextPath,
  signInPath,
  welcomePath,
} from "../src/features/auth/redirects";
import {
  normalizeBio,
  normalizeDisplayName,
  validateBio,
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

test("new users go to profile setup first, then their destination", () => {
  assert.equal(postSignInPath(true, "/upload"), "/upload");
  assert.equal(postSignInPath(false, "/upload"), "/welcome?next=%2Fupload");
  assert.equal(postSignInPath(false, null), "/welcome");
  assert.equal(welcomePath("/account"), "/welcome?next=%2Faccount");
  // The welcome page itself is never a destination, so it cannot loop.
  assert.equal(safeNextPath("/welcome"), "/");
  assert.equal(safeNextPath("/welcome?next=%2Fupload"), "/");
});

test("bios are optional, short, and printable", () => {
  assert.deepEqual(validateBio(""), []);
  assert.deepEqual(validateBio("  Home wall at 40°, PETG-CF fan.\n"), []);
  assert.equal(validateBio("x".repeat(281)).length, 1);
  assert.equal(validateBio("tab\there").length, 1);
  assert.equal(normalizeBio("a\r\nb "), "a\nb");
});
