// Two short openings: a garage door that rolls up after signing in, and the
// shop light coming on when someone walks into Hold Labs. Each is a layer
// over a page that is already there and usable; neither delays it.

export type Intro = "door" | "light";

// Set on <html> while an intro plays; intros.css draws from it.
export const INTRO_ATTRIBUTE = "data-intro";

export const LIGHT_STORAGE_KEY = "gh-shop-light";
export const LIGHT_INTERVAL_MS = 60 * 60 * 1000;

export function isLabsPath(pathname: string) {
  return pathname === "/make" || pathname.startsWith("/make/");
}

// The light comes on at most once an hour. A missing, unreadable or future
// time counts as never.
export function lightDue(now: number, stored: string | null) {
  if (!stored) return true;
  const last = Number(stored);
  if (!Number.isFinite(last) || last > now) return true;
  return now - last >= LIGHT_INTERVAL_MS;
}

// Runs before first paint on a full page load, so a lab never shows lit and
// then goes dark. It repeats isLabsPath and lightDue in plain script (the
// test keeps the two in step) and contains no user-supplied content. Where
// storage is blocked it does nothing, so the light never plays on every visit.
export const LIGHT_INITIALIZATION_SCRIPT = `try{var p=location.pathname;if((p==="/make"||p.indexOf("/make/")===0)&&!matchMedia("(prefers-reduced-motion: reduce)").matches){var n=Date.now(),s=localStorage.getItem("${LIGHT_STORAGE_KEY}"),l=Number(s);if(!s||!isFinite(l)||l>n||n-l>=${LIGHT_INTERVAL_MS}){localStorage.setItem("${LIGHT_STORAGE_KEY}",String(n));document.documentElement.setAttribute("${INTRO_ATTRIBUTE}","light")}}}catch{}`;
