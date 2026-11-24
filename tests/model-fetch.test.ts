import test from "node:test";
import assert from "node:assert/strict";
import { fetchModel } from "../src/features/holds/model-fetch";

// A stand-in for fetch: each address answers with a status, or throws as a
// browser does when the bucket's refusal comes without CORS headers.
function fetcher(answers: Record<string, number | "blocked">) {
  const asked: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    const answer = answers[url];
    if (answer === "blocked") throw new TypeError("Failed to fetch");
    return new Response(answer === 200 ? url : null, { status: answer });
  }) as typeof fetch;
  return { impl, asked };
}
const text = (bytes: ArrayBuffer) => new TextDecoder().decode(bytes);

test("a working link is downloaded without asking for another", async () => {
  const { impl, asked } = fetcher({ "/model": 200 });
  let renewed = 0;
  const bytes = await fetchModel(
    "/model",
    async () => (renewed++, "/fresh"),
    impl,
  );
  assert.equal(text(bytes), "/model");
  assert.deepEqual(asked, ["/model"]);
  assert.equal(renewed, 0);
});

test("an expired link is renewed once and the download tried again", async () => {
  for (const refusal of [403, "blocked"] as const) {
    const { impl, asked } = fetcher({ "/old": refusal, "/fresh": 200 });
    const bytes = await fetchModel("/old", async () => "/fresh", impl);
    assert.equal(text(bytes), "/fresh");
    assert.deepEqual(asked, ["/old", "/fresh"]);
  }
});

test("a model that still cannot be had fails after one renewal", async () => {
  // No fresh link (the design was unpublished, or storage is not set up),
  // the renewal itself failing, and a fresh link that is refused too.
  const cases: [() => Promise<string | null>, string[]][] = [
    [async () => null, ["/old"]],
    [async () => Promise.reject(new Error("offline")), ["/old"]],
    [async () => "/fresh", ["/old", "/fresh"]],
  ];
  for (const [renew, expected] of cases) {
    const { impl, asked } = fetcher({ "/old": 403, "/fresh": 403 });
    await assert.rejects(fetchModel("/old", renew, impl), /Could not load/);
    assert.deepEqual(asked, expected);
  }
});
