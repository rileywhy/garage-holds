import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import {
  INTRO_ATTRIBUTE,
  LIGHT_INITIALIZATION_SCRIPT,
  LIGHT_INTERVAL_MS,
  LIGHT_STORAGE_KEY,
  isLabsPath,
  lightDue,
} from "../src/features/intros/intros";

const NOW = 1_800_000_000_000;

test("the labs are /make and everything under it", () => {
  assert.equal(isLabsPath("/make"), true);
  assert.equal(isLabsPath("/make/jug"), true);
  assert.equal(isLabsPath("/"), false);
  assert.equal(isLabsPath("/makers"), false);
  assert.equal(isLabsPath("/holds/make"), false);
});

test("the shop light is due once an hour", () => {
  assert.equal(lightDue(NOW, null), true);
  assert.equal(lightDue(NOW, String(NOW - 1)), false);
  assert.equal(lightDue(NOW, String(NOW - LIGHT_INTERVAL_MS + 1)), false);
  assert.equal(lightDue(NOW, String(NOW - LIGHT_INTERVAL_MS)), true);
});

test("an unreadable or future time counts as never", () => {
  assert.equal(lightDue(NOW, "yesterday"), true);
  assert.equal(lightDue(NOW, ""), true);
  assert.equal(lightDue(NOW, String(NOW + 5000)), true);
});

// The head script decides full page loads on its own, before any module has
// loaded, so it is run here against the same cases as the functions above.
function runHeadScript(options: {
  pathname: string;
  stored: string | null;
  reducedMotion?: boolean;
  blockedStorage?: boolean;
}) {
  const attributes = new Map<string, string>();
  const storage = new Map<string, string>();
  if (options.stored !== null) storage.set(LIGHT_STORAGE_KEY, options.stored);
  const context = vm.createContext({
    location: { pathname: options.pathname },
    matchMedia: () => ({ matches: options.reducedMotion ?? false }),
    Date: { now: () => NOW },
    localStorage: {
      getItem(key: string) {
        if (options.blockedStorage) throw new Error("blocked");
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
    },
    document: {
      documentElement: {
        setAttribute(name: string, value: string) {
          attributes.set(name, value);
        },
      },
    },
  });
  vm.runInContext(LIGHT_INITIALIZATION_SCRIPT, context);
  return {
    intro: attributes.get(INTRO_ATTRIBUTE) ?? null,
    stored: storage.get(LIGHT_STORAGE_KEY) ?? null,
  };
}

test("the head script turns the light on in a lab when it is due", () => {
  for (const pathname of ["/make", "/make/jug"]) {
    for (const stored of [null, "yesterday", String(NOW - LIGHT_INTERVAL_MS)]) {
      const result = runHeadScript({ pathname, stored });
      assert.equal(result.intro, "light", `${pathname} ${stored}`);
      assert.equal(result.stored, String(NOW));
      assert.equal(lightDue(NOW, stored), true);
    }
  }
});

test("the head script leaves the light off when it is not due", () => {
  const recent = String(NOW - 60_000);
  assert.equal(lightDue(NOW, recent), false);
  assert.deepEqual(runHeadScript({ pathname: "/make/jug", stored: recent }), {
    intro: null,
    stored: recent,
  });
  for (const pathname of ["/", "/makers", "/holds/make"])
    assert.equal(runHeadScript({ pathname, stored: null }).intro, null);
});

test("reduced motion and blocked storage never see the light", () => {
  assert.equal(
    runHeadScript({ pathname: "/make", stored: null, reducedMotion: true })
      .intro,
    null,
  );
  assert.equal(
    runHeadScript({ pathname: "/make", stored: null, blockedStorage: true })
      .intro,
    null,
  );
});
