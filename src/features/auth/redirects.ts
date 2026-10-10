// Only same-origin paths may be used as post-sign-in destinations, so a crafted
// link cannot bounce a user to another site after they authenticate.
export function safeNextPath(value: string | null | undefined, fallback = "/") {
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return fallback;
  if (/[\\\s]/.test(value) || value.startsWith("/sign-in")) return fallback;
  return value;
}

export function signInPath(next?: string | null) {
  const target = safeNextPath(next);
  return target === "/"
    ? "/sign-in"
    : `/sign-in?next=${encodeURIComponent(target)}`;
}
