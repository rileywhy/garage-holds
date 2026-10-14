"use client";

import { Download } from "lucide-react";
import { trackEvent } from "@/features/analytics/events";

// The download button on a design page, counted per file type.
export function DownloadLink({
  url,
  name,
  hold,
  extension,
}: {
  url: string;
  name: string;
  hold: string;
  extension: string;
}) {
  return (
    <a
      href={url}
      className="icon-button"
      aria-label={`Download ${name}`}
      download={name}
      onClick={() => trackEvent({ name: "download_file", hold, extension })}
    >
      <Download size={18} />
    </a>
  );
}
