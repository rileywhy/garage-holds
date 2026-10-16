// A sliding-window counter per key, in memory. Each server instance keeps
// its own, so this is a brake on casual abuse, not an exact quota: enough
// to stop one person or script from filling the feedback table and the
// owner's channel in a minute.
export function createRateLimiter(
  limit: number,
  windowMs: number,
  now: () => number = Date.now,
): (key: string) => boolean {
  const hits = new Map<string, number[]>();
  return (key) => {
    const time = now();
    const cutoff = time - windowMs;
    for (const [k, times] of hits) {
      const recent = times.filter((t) => t > cutoff);
      if (recent.length) hits.set(k, recent);
      else hits.delete(k);
    }
    const recent = hits.get(key) ?? [];
    if (recent.length >= limit) return false;
    recent.push(time);
    hits.set(key, recent);
    return true;
  };
}
