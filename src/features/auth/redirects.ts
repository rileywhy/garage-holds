// Only same-origin paths may be used as post-sign-in destinations, so a crafted
// link cannot bounce a user to another site after they authenticate.
export function safeNextPath(value: string | null | undefined, fallback = "/") {
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return fallback;
  if (/[\\\s]/.test(value) || value.startsWith("/sign-in")) return fallback;
  if (value === "/welcome" || value.startsWith("/welcome?")) return fallback;
  return value;
}

function withNext(path: string, next?: string | null) {
  const target = safeNextPath(next);
  return target === "/" ? path : `${path}?next=${encodeURIComponent(target)}`;
}

export function signInPath(next?: string | null) {
  return withNext("/sign-in", next);
}

export function welcomePath(next?: string | null) {
  return withNext("/welcome", next);
}

// Where a freshly signed-in user goes: their destination, or profile setup
// first if they have never completed it.
export function postSignInPath(onboarded: boolean, next?: string | null) {
  return onboarded ? safeNextPath(next) : welcomePath(next);
}
