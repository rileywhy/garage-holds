import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "../src/lib/rate-limit";

test("a key gets its allowance per window, then waits for it to slide", () => {
  let now = 0;
  const allow = createRateLimiter(3, 1000, () => now);
  assert.equal(allow("a"), true);
  now = 100;
  assert.equal(allow("a"), true);
  now = 200;
  assert.equal(allow("a"), true);
  assert.equal(allow("a"), false, "fourth within the window is refused");
  assert.equal(allow("b"), true, "other keys are counted separately");
  now = 999;
  assert.equal(allow("a"), false);
  now = 1001;
  assert.equal(allow("a"), true, "the first hit has slid out of the window");
  assert.equal(allow("a"), false, "but only one slot has opened");
});
