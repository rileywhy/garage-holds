"use client";

import { useSyncExternalStore } from "react";

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

const subscribe = () => () => {};

// A timestamp as a date in the visitor's own time zone, so an evening save
// doesn't read as tomorrow. The server can't know that zone, so the server
// render and hydration use UTC and the browser switches right after.
export function LocalDate({ iso }: { iso: string }) {
  const inBrowser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const text = new Date(iso).toLocaleDateString(
    inBrowser ? undefined : "en",
    inBrowser ? DATE_FORMAT : { ...DATE_FORMAT, timeZone: "UTC" },
  );
  return <time dateTime={iso}>{text}</time>;
}
