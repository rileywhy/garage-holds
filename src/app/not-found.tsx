import Link from "next/link";
export default function NotFound() {
  return (
    <main className="main-container empty-state">
      <h1>A hold on the route is missing.</h1>
      <p>
        This page doesn’t exist. Head back to the library to find your next
        design.
      </p>
      <Link href="/" className="button button-dark">
        Back to the library
      </Link>
    </main>
  );
}
