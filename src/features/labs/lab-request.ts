// One way for every lab to call its generator. A request gives up after a
// set time instead of waiting on a cold start forever, every failure comes
// back as a sentence the person can act on, and each carries a reason the
// analytics can count, so "how often does the generator wake up slowly"
// has an answer.

export type LabErrorReason =
  // The generator did not answer in time (our timer, or a gateway 503/504).
  | "timeout"
  // The browser could not reach the site at all.
  | "network"
  // The generator answered with a failure of its own.
  | "server"
  // The generator refused the settings (a shape it cannot build).
  | "rejected"
  // There is no generator behind this address on this deployment.
  | "missing";

export class LabError extends Error {
  constructor(
    message: string,
    public readonly reason: LabErrorReason,
  ) {
    super(message);
    this.name = "LabError";
  }
}

// Vercel stops a generator at 30 s; previews should be well inside that.
export const REQUEST_TIMEOUT_MS = 20_000;
export const EXPORT_TIMEOUT_MS = 30_000;

export const LAB_MESSAGES = {
  timeout:
    "The generator took too long to answer. It is probably waking up; try again in a few seconds.",
  network:
    "Could not reach the generator. Check your connection and try again.",
  missing: "This generator is not set up on this site.",
  server: (status: number) =>
    `The generator failed (HTTP ${status}). Try again in a moment.`,
};

// The reason behind any error a lab caught, for the lab_error event.
export function errorReason(error: unknown): LabErrorReason {
  return error instanceof LabError ? error.reason : "rejected";
}

export async function labRequest(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const { timeoutMs = REQUEST_TIMEOUT_MS, signal, ...rest } = init;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forward = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", forward);
  let response: Response;
  try {
    response = await fetchImpl(url, { ...rest, signal: controller.signal });
  } catch (error) {
    signal?.removeEventListener("abort", forward);
    if (timedOut) throw new LabError(LAB_MESSAGES.timeout, "timeout");
    // The lab itself cancelled a superseded request: hand that back as is.
    if ((error as Error).name === "AbortError") throw error;
    throw new LabError(LAB_MESSAGES.network, "network");
  } finally {
    clearTimeout(timer);
  }
  // The headers are in, but the lab still has the body to read. Its signal
  // keeps forwarding so a cancellation now stops that read too, instead of
  // a late body landing on whatever page is showing by then. The listener
  // lives as long as the lab's signal, which is one per request.
  if (response.ok) return response;
  if (response.status === 404)
    throw new LabError(LAB_MESSAGES.missing, "missing");
  if (response.status === 503 || response.status === 504)
    throw new LabError(LAB_MESSAGES.timeout, "timeout");
  let message = "";
  try {
    message = String((await response.json()).error ?? "");
  } catch {
    // A gateway page or an empty body: the status code is all we have.
  }
  if (response.status < 500 && message) throw new LabError(message, "rejected");
  throw new LabError(message || LAB_MESSAGES.server(response.status), "server");
}
