"use client";

import { track } from "@vercel/analytics";

// The few clicks worth counting. Vercel records the page each one happened
// on by itself; the properties say which thing was clicked. Names and
// properties are listed here so the Analytics tab stays readable.
type Lab = "crimp" | "sloper" | "jug" | "foot" | "custom-shape";

type Event =
  // The labs: an export is the conversion, an error says a generator call
  // failed (cold start, timeout, or a shape it refused) and at which step.
  | { name: "export_stl"; lab: Lab }
  | { name: "lab_error"; lab: Lab; stage: "start" | "preview" | "export" }
  // Settings saved to a file, loaded from one, copied as a link, or opened
  // from a link someone shared.
  | {
      name: "lab_settings";
      lab: Lab;
      action: "save" | "load" | "link" | "open";
    }
  // The library.
  | { name: "publish_design"; hold: string; files: number; photos: number }
  | { name: "save_design"; hold: string }
  | { name: "review_posted"; hold: string }
  | { name: "download_file"; hold: string; extension: string }
  // Accounts and the rest.
  | { name: "sign_in"; method: "google" | "email" }
  | { name: "feedback_sent"; kind: "feedback" | "report" }
  | { name: "gear_click"; item: string }
  | { name: "tip_click" };

export function trackEvent({ name, ...properties }: Event) {
  try {
    track(name, properties);
  } catch {
    // Analytics never gets to break a click.
  }
}
