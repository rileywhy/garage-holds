// Turns an error into the one line the owner's webhook receives, and keeps a
// storm of the same error from sending more than one line a minute. Plain
// TypeScript so the tests can run it; `alerts.ts` and `instrumentation.ts`
// do the sending.

export const MAX_MESSAGE = 500;
export const MAX_PATH = 300;
export const ALERT_WINDOW_MS = 60_000;
// Discord refuses anything over 2000 characters; feedback is up to 2000 on
// its own, so a webhook line is cut with room for its prefix.
export const MAX_WEBHOOK_MESSAGE = 1900;

export interface ErrorSummary {
  name: string;
  message: string;
  digest?: string;
}

// `error` is whatever was thrown, so it may be anything at all.
export function describeError(error: unknown): ErrorSummary {
  if (error instanceof Error) {
    const digest =
      "digest" in error && typeof error.digest === "string"
        ? error.digest
        : undefined;
    return {
      name: error.name || "Error",
      message: clip(error.message, MAX_MESSAGE),
      digest,
    };
  }
  return { name: "Error", message: clip(String(error), MAX_MESSAGE) };
}

// What Next.js hands `onRequestError`, minus the headers, which are never
// read. The path may carry a query string.
export interface ServerErrorRequest {
  path: string;
  method: string;
}

export interface ServerErrorContext {
  routePath: string;
  routeType: string;
}

// One line, built only from the route template and the error. The concrete
// path's dynamic segments are replaced by the template's, so a phone-session
// id in `/phone/<session>` never leaves the server, and the query string is
// dropped for the same reason.
export function formatServerError(
  error: unknown,
  request: ServerErrorRequest,
  context: ServerErrorContext,
): string {
  const summary = describeError(error);
  const path = redactPath(request.path, context.routePath);
  return `Server error in ${context.routeType} ${request.method} ${path}: ${summary.name}: ${summary.message}${digestSuffix(summary)}`;
}

// Keys the rate limiter: the same error on the same route counts as one.
export function serverErrorKey(
  error: unknown,
  context: ServerErrorContext,
): string {
  const summary = describeError(error);
  return `${context.routePath}|${summary.name}|${summary.digest ?? summary.message}`;
}

// `/holds/abc123?x=1` with route `/holds/[id]` becomes `/holds/[id]`. The
// real path is kept only where it matches the template segment for segment,
// without its query string; anything else falls back to the template.
export function redactPath(path: string, routePath: string): string {
  const bare = path.split("?")[0] ?? "";
  const actual = bare.split("/");
  const template = routePath.split("/");
  if (actual.length !== template.length) return routePath;
  const segments: string[] = [];
  for (let index = 0; index < template.length; index++) {
    const pattern = template[index] ?? "";
    const segment = actual[index] ?? "";
    if (pattern.startsWith("[")) segments.push(pattern);
    else if (pattern === segment) segments.push(segment);
    else return routePath;
  }
  return segments.join("/");
}

// What the browser's error boundary sends. Every field is untrusted, and
// the line it becomes is posted to a chat channel, so the message is
// flattened to plain text and the path is reduced to its route template.
export interface ClientErrorReport {
  message: string;
  digest: string;
  path: string;
}

// The app's page routes, for redacting what the browser reports. A test
// checks this list against `src/app`, so a new dynamic route cannot leak
// its segment by being forgotten here.
export const CLIENT_ROUTES = [
  "/",
  "/account",
  "/designs",
  "/holds/[id]",
  "/holds/[id]/edit",
  "/how-to-3d-print-climbing-holds",
  "/make",
  "/make/crimp",
  "/make/custom-shape",
  "/make/foot",
  "/make/jug",
  "/make/pinch",
  "/make/pocket",
  "/make/sloper",
  "/phone/[session]",
  "/privacy",
  "/saved",
  "/sign-in",
  "/terms",
  "/upload",
  "/welcome",
];

export function validateClientReport(input: unknown): ClientErrorReport | null {
  if (typeof input !== "object" || input === null) return null;
  const record = input as Record<string, unknown>;
  const message =
    typeof record.message === "string" ? plainLine(record.message) : "";
  const digest = typeof record.digest === "string" ? record.digest : "";
  const path = typeof record.path === "string" ? record.path : "";
  if (!message && !digest) return null;
  if (digest && !/^[\w-]{1,64}$/.test(digest)) return null;
  if (path && !path.startsWith("/")) return null;
  return {
    message: clip(message, MAX_MESSAGE),
    digest,
    path: path ? clip(redactClientPath(path), MAX_PATH) : "",
  };
}

// `/phone/abc123?x=1` becomes `/phone/[session]`: the path is matched
// against the route list, and a path that matches nothing keeps only its
// first segment, so an unknown address can never carry a secret through.
export function redactClientPath(path: string): string {
  const bare = plainLine(path.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
  for (const route of CLIENT_ROUTES)
    if (matchesRoute(bare, route)) return route;
  const [, first = ""] = bare.split("/");
  return first ? `/${first}/[…]` : "/";
}

function matchesRoute(path: string, route: string): boolean {
  const actual = path.split("/");
  const template = route.split("/");
  return (
    actual.length === template.length &&
    template.every(
      (pattern, index) =>
        pattern.startsWith("[") || pattern === (actual[index] ?? ""),
    )
  );
}

// Visitor text on one line with no markdown: newlines become spaces, and
// the characters Discord and Slack read as formatting, links or mentions
// are dropped. Error messages lose a little punctuation and stay readable.
export function plainLine(text: string): string {
  return text
    .replace(/[`*_~|\[\]<>@#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatClientError(report: ClientErrorReport): string {
  const where = report.path || "an unknown page";
  const what = report.message || "an error with no message";
  return `Client error on ${where}: ${what}${digestSuffix(report)}`;
}

export function clientErrorKey(report: ClientErrorReport): string {
  return `client|${report.digest || report.message}`;
}

// Allows one send per key per window. The map lives in memory, so on
// serverless hosting each instance keeps its own count; that still cuts a
// storm down to a line a minute per instance, which is what the owner wants.
export function createAlertLimiter(
  windowMs = ALERT_WINDOW_MS,
  now: () => number = Date.now,
): (key: string) => boolean {
  const lastSent = new Map<string, number>();
  return (key) => {
    const time = now();
    for (const [k, sent] of lastSent)
      if (time - sent >= windowMs) lastSent.delete(k);
    if (lastSent.has(key)) return false;
    lastSent.set(key, time);
    return true;
  };
}

export function clipMessage(message: string): string {
  return clip(message, MAX_WEBHOOK_MESSAGE);
}

// Slack reads `<!channel>` and `<@user>` as mentions and `&` as the start
// of an entity, so visitor text has to be escaped before it is quoted.
export function escapeSlack(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function digestSuffix(summary: { digest?: string }): string {
  return summary.digest ? ` [digest ${summary.digest}]` : "";
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
