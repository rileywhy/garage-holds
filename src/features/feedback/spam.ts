import type { FeedbackInput } from "./validation";

// Phrases from the sales pitches the form attracts: SEO and "AI search"
// visibility offers, and search-index submission scams. Kept narrow so a
// real bug report rarely trips one, and a pitch is still stored, so a
// false match costs a notification, not the message.
const PITCHES = [
  /\bSEO\b/i,
  /\bsearch index\b/i,
  /\brank (higher|on google)\b/i,
  /\bbacklinks?\b/i,
  /\bguest posts?\b/i,
  /\bonline (visibility|presence)\b/i,
  /\bdomain ?submit/i,
];

// "bot": the page field is empty. The widget fills it with the page it was
// opened on, and it only opens with JavaScript running, so an empty one
// means something posted the form without using it.
// "pitch": a sales pitch, kept out of the owner's channel.
export type SpamVerdict = "bot" | "pitch" | null;

export function spamVerdict(input: FeedbackInput): SpamVerdict {
  if (!input.page.startsWith("/")) return "bot";
  const text = `${input.body}\n${input.contact}`;
  return PITCHES.some((pitch) => pitch.test(text)) ? "pitch" : null;
}
