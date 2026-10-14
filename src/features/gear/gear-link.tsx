"use client";

import type { ReactNode } from "react";
import { trackEvent } from "@/features/analytics/events";
import { gearUrl, type GearItem } from "./gear";

// A shopping link. Marked sponsored so search engines do not count it as an
// endorsement, and opened in a new tab so the reader keeps their place.
export function GearLink({
  item,
  children,
  className,
}: {
  item: GearItem;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={gearUrl(item)}
      rel="sponsored noopener"
      target="_blank"
      className={className}
      onClick={() => trackEvent({ name: "gear_click", item: item.id })}
    >
      {children ?? item.label}
    </a>
  );
}
