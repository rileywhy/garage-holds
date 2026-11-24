// Downloads a stored STL for a preview. Its link is signed for an hour, so a
// page left open (or brought back with the back button) holds links the
// bucket now refuses, and until November 2026 every preview not yet drawn
// then said "unavailable" until a reload. When the download fails, `renew`
// asks the server for a fresh link and the download is tried once more.
//
// The bucket's refusal carries no CORS headers, so the browser reports it
// as a network error rather than a 403; any failure is worth the one retry.
export async function fetchModel(
  url: string,
  renew: () => Promise<string | null>,
  fetchImpl: typeof fetch = fetch,
): Promise<ArrayBuffer> {
  const first = await download(url, fetchImpl);
  if (first) return first;
  const fresh = await renew().catch(() => null);
  const second = fresh ? await download(fresh, fetchImpl) : null;
  if (!second) throw new Error("Could not load this STL.");
  return second;
}

async function download(url: string, fetchImpl: typeof fetch) {
  try {
    const response = await fetchImpl(url);
    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}
