import assert from "node:assert/strict";
import test from "node:test";
import {
  LabError,
  LAB_MESSAGES,
  labRequest,
} from "../src/features/labs/lab-request";

function respond(status: number, body: string, type = "application/json") {
  return async () =>
    new Response(body, { status, headers: { "Content-Type": type } });
}

async function failure(promise: Promise<unknown>): Promise<LabError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof LabError, `expected a LabError, got ${error}`);
    return error;
  }
  assert.fail("expected the request to fail");
}

test("a good response comes back untouched", async () => {
  const response = await labRequest("/api/x", {}, respond(200, '{"ok":1}'));
  assert.deepEqual(await response.json(), { ok: 1 });
});

test("a slow generator is a timeout, not a hang", async () => {
  const never: typeof fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
    });
  const error = await failure(labRequest("/api/x", { timeoutMs: 20 }, never));
  assert.equal(error.reason, "timeout");
  assert.equal(error.message, LAB_MESSAGES.timeout);
});

test("the lab's own cancellation passes through as an AbortError", async () => {
  const controller = new AbortController();
  const never: typeof fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
    });
  const pending = labRequest("/api/x", { signal: controller.signal }, never);
  controller.abort();
  await assert.rejects(pending, (error: Error) => error.name === "AbortError");
});

test("no connection reads as a network problem", async () => {
  const offline: typeof fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  const error = await failure(labRequest("/api/x", {}, offline));
  assert.equal(error.reason, "network");
});

test("a missing generator says so instead of blaming a cold start", async () => {
  const error = await failure(labRequest("/api/x", {}, respond(404, "")));
  assert.equal(error.reason, "missing");
  assert.equal(error.message, LAB_MESSAGES.missing);
});

test("the generator's own refusal keeps its wording", async () => {
  const error = await failure(
    labRequest("/api/x", {}, respond(400, '{"error":"Edge too deep."}')),
  );
  assert.equal(error.reason, "rejected");
  assert.equal(error.message, "Edge too deep.");
});

test("a gateway timeout page is a timeout even without JSON", async () => {
  const error = await failure(
    labRequest("/api/x", {}, respond(504, "<html>gateway</html>", "text/html")),
  );
  assert.equal(error.reason, "timeout");
});

test("an unexplained failure names the status", async () => {
  const error = await failure(labRequest("/api/x", {}, respond(500, "")));
  assert.equal(error.reason, "server");
  assert.equal(error.message, LAB_MESSAGES.server(500));
});
