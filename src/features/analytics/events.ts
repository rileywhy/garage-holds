"use client";

import { track } from "@vercel/analytics";

// The few clicks worth counting. Vercel records the page each one happened
// on by itself; the properties say which thing was clicked. Names and
// properties are listed here so the Analytics tab stays readable.
type Event =
  | { name: "export_stl"; lab: "crimp" | "sloper" | "jug" }
  | { name: "gear_click"; item: string }
  | { name: "tip_click" }
  | { name: "download_file"; hold: string; extension: string };

export function trackEvent({ name, ...properties }: Event) {
  try {
    track(name, properties);
  } catch {
    // Analytics never gets to break a click.
  }
}
