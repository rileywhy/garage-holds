import type { Metadata } from "next";
import { CatalogBrowser } from "@/features/holds/catalog-browser";
import {
  countPublishedByType,
  listPublishedHolds,
  listSavedIds,
} from "@/features/holds/repository";
import {
  parseCatalogQuery,
  type SearchParams,
} from "@/features/holds/catalog-query";
import { getCurrentUser } from "@/features/auth/current-user";

// Title, description, and preview come from the layout; the canonical
// address keeps the home page at the bare domain, whatever the filters.
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseCatalogQuery(await searchParams);
  const user = await getCurrentUser();
  const [page, typeCounts, savedIds] = await Promise.all([
    listPublishedHolds(query),
    countPublishedByType(),
    user ? listSavedIds() : Promise.resolve<string[]>([]),
  ]);
  return (
    <CatalogBrowser
      page={page}
      query={query}
      typeCounts={typeCounts}
      savedIds={savedIds}
      signedIn={user !== null}
    />
  );
}
