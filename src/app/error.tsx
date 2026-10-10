"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="main-container empty-state">
      <h1>Something interrupted the climb.</h1>
      <p>The page couldn’t load. Try again to return to your library.</p>
      <button className="button button-dark" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
