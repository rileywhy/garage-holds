import test from "node:test";
import assert from "node:assert/strict";
import {
  checkAllowance,
  formatGigabytes,
  isNearLimit,
  limitMessage,
} from "../src/features/uploads/allowance";

const GB = 1024 ** 3;
const limits = { designs: 20, bytes: 2 * GB };

test("uploads are refused only past the account's limits", () => {
  assert.deepEqual(
    checkAllowance({ designs: 19, bytes: GB }, limits, {
      designs: 1,
      bytes: 100,
    }),
    { allowed: true },
  );
  assert.deepEqual(
    checkAllowance({ designs: 20, bytes: 0 }, limits, {
      designs: 1,
      bytes: 100,
    }),
    { allowed: false, reason: "designs" },
  );
  assert.deepEqual(
    checkAllowance({ designs: 0, bytes: 2 * GB - 50 }, limits, {
      designs: 1,
      bytes: 100,
    }),
    { allowed: false, reason: "bytes" },
  );
  assert.deepEqual(
    checkAllowance({ designs: 5, bytes: 0 }, limits, {
      designs: 0,
      bytes: 3 * GB,
    }),
    { allowed: false, reason: "bytes" },
  );
});

test("the owner is warned at 80% of either limit", () => {
  assert.equal(isNearLimit({ designs: 15, bytes: 0 }, limits), false);
  assert.equal(isNearLimit({ designs: 16, bytes: 0 }, limits), true);
  assert.equal(isNearLimit({ designs: 0, bytes: 1.7 * GB }, limits), true);
  assert.equal(
    isNearLimit({ designs: 0, bytes: 0 }, { designs: 0, bytes: 0 }),
    true,
  );
});

test("limit messages name the limit and who to ask", () => {
  assert.equal(formatGigabytes(2 * GB), "2 GB");
  assert.equal(formatGigabytes(1.5 * GB), "1.5 GB");
  assert.equal(formatGigabytes(10 * GB), "10 GB");
  assert.match(
    limitMessage("designs", limits, "hello@example.com"),
    /20 designs.*hello@example\.com/,
  );
  assert.match(
    limitMessage("bytes", limits, null),
    /2 GB of files.*Get in touch/,
  );
});
