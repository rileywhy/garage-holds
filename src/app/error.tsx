"use client";

import { useEffect } from "react";
import { reportClientError } from "@/features/feedback/actions";

// Catches a page that fails below the root layout. Server-side failures
// arrive with a generic message and a digest that matches the server's own
// alert; browser-side failures carry their real message.
export default function ErrorPage({
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
    <main className="main-container empty-state">
      <h1>The website took a bad whipper.</h1>
      <p>The page didn’t load. Try again, or come back in a minute.</p>
      <button className="button button-dark" onClick={() => retry()}>
        Try again
      </button>
    </main>
  );
}
