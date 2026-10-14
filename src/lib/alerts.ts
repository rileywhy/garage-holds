import "server-only";
import { createAlertLimiter } from "./error-reports";

// One-line notices for the site owner: someone hit an upload limit, or is
// close to one. ALERT_WEBHOOK_URL is a Discord or Slack incoming webhook;
// both accept a JSON body, and each reads its own field. Without it the
// notice goes to the server log, which Vercel keeps for an hour.
export async function notifyOwner(message: string) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) {
    console.warn("owner alert", message);
    return;
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Messages quote visitor text, so Discord must not turn an @everyone
      // in it into a ping. Slack ignores the field.
      body: JSON.stringify({
        content: message,
        text: message,
        allowed_mentions: { parse: [] },
      }),
    });
    if (!response.ok)
      console.error("owner alert webhook failed", response.status, message);
  } catch (error) {
    console.error("owner alert webhook failed", error, message);
  }
}

// For errors, which can repeat hundreds of times in a minute: the first one
// with a given key is sent, the rest are dropped until a minute has passed.
const allow = createAlertLimiter();

export async function notifyOwnerOnce(key: string, message: string) {
  if (!allow(key)) return;
  await notifyOwner(message);
}
