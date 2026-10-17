"use client";

import { useEffect } from "react";
import { reportClientError } from "@/features/feedback/actions";
import { SITE_NAME } from "@/lib/page-metadata";
import { THEME_INITIALIZATION_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Replaces the root layout when the layout itself fails, so it has to bring
// its own document, styles, and theme. Reports the failure the same way
// error.tsx does.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    void reportClientError({
      message: error.message,
      digest: error.digest ?? "",
      path: window.location.pathname,
    });
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>{`Took a whipper | ${SITE_NAME}`}</title>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INITIALIZATION_SCRIPT }}
        />
      </head>
      <body>
        <main className="main-container empty-state">
          <h1>The website took a bad whipper.</h1>
          <p>The site didn’t load. Try again, or come back in a minute.</p>
          <button className="button button-dark" onClick={() => retry()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
