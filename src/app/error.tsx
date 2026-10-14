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
      <h1>Something interrupted the climb.</h1>
      <p>The page couldn’t load. Try again to return to your library.</p>
      <button className="button button-dark" onClick={() => retry()}>
        Try again
      </button>
    </main>
  );
}
