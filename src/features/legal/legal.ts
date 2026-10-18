// The privacy policy and terms (RIL-111, RIL-112). Bump `updated` when what
// either page promises changes, not for typos. The address is fixed rather
// than read from NEXT_PUBLIC_CONTACT_EMAIL: what the policy names must not
// change with an environment variable.
export const LEGAL = {
  updated: "2026-10-17",
  contact: "support@garageholds.com",
  // Governing law and where disputes are heard.
  state: "Utah",
  venue: "Salt Lake County, Utah",
};

// "17 October 2026", for the "Last updated" line.
export function legalDateLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
