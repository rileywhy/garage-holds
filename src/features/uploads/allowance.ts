// Per-account upload allowance: how many designs and how many bytes one
// account may hold. The limits live on the profile so they can be raised
// for people uploading real designs; the defaults are in the migration.
// No I/O here, so the decision is testable on its own.

export interface UploadLimits {
  designs: number;
  bytes: number;
}

export interface UploadUsage {
  designs: number;
  bytes: number;
}

// Above this share of either limit the owner is told, so a good uploader
// can have their limit raised before they ever hit it.
export const NEAR_LIMIT = 0.8;

export type AllowanceCheck =
  { allowed: true } | { allowed: false; reason: "designs" | "bytes" };

export function checkAllowance(
  usage: UploadUsage,
  limits: UploadLimits,
  incoming: { designs: number; bytes: number },
): AllowanceCheck {
  if (usage.designs + incoming.designs > limits.designs)
    return { allowed: false, reason: "designs" };
  if (usage.bytes + incoming.bytes > limits.bytes)
    return { allowed: false, reason: "bytes" };
  return { allowed: true };
}

export function isNearLimit(usage: UploadUsage, limits: UploadLimits) {
  return (
    share(usage.designs, limits.designs) >= NEAR_LIMIT ||
    share(usage.bytes, limits.bytes) >= NEAR_LIMIT
  );
}

function share(used: number, limit: number) {
  return limit > 0 ? used / limit : 1;
}

export function formatGigabytes(bytes: number) {
  const gigabytes = bytes / 1024 ** 3;
  return `${gigabytes >= 10 ? Math.round(gigabytes) : Math.round(gigabytes * 10) / 10} GB`;
}

export function limitMessage(
  reason: "designs" | "bytes",
  limits: UploadLimits,
  contact: string | null,
) {
  const what =
    reason === "designs"
      ? `${limits.designs} designs`
      : `${formatGigabytes(limits.bytes)} of files`;
  const ask = contact
    ? `Email ${contact} and we'll raise it; real designs are always welcome.`
    : "Get in touch and we'll raise it; real designs are always welcome.";
  return `This account has reached its upload allowance of ${what}. ${ask}`;
}
