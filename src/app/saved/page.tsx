import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CatalogBrowser } from "@/features/holds/catalog-browser";
import { listReviews, listSavedHolds } from "@/features/holds/repository";
import { getCurrentUser } from "@/features/auth/current-user";
import { signInPath } from "@/features/auth/redirects";

export const metadata: Metadata = { title: "Saved designs" };

export default async function SavedPage() {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath("/saved"));
  const [holds, reviews] = await Promise.all([listSavedHolds(), listReviews()]);
  return (
    <CatalogBrowser
      holds={holds}
      reviews={reviews}
      savedIds={holds.map((hold) => hold.id)}
      signedIn
      savedOnly
    />
  );
}
