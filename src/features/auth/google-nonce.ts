// A one-time value that ties a Google ID token to this page load. Google gets
// the SHA-256 hash and signs it into the token; Supabase gets the raw value,
// hashes it, and refuses a token whose nonce does not match, so a token
// lifted from elsewhere cannot be replayed here.
export async function createGoogleNonce(): Promise<{
  raw: string;
  hashed: string;
}> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  const hashed = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return { raw, hashed };
}
