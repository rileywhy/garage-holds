import { CatalogBrowser } from "@/features/holds/catalog-browser";
import { SAMPLE_HOLDS } from "@/features/holds/sample-data";
import {
  listPublishedHolds,
  listReviews,
  listSavedIds,
} from "@/features/holds/repository";
import { getCurrentUser } from "@/features/auth/current-user";

export default async function HomePage() {
  const user = await getCurrentUser();
  const [holds, reviews, savedIds] = await Promise.all([
    listPublishedHolds(),
    listReviews(),
    user ? listSavedIds() : Promise.resolve<string[]>([]),
  ]);
  return (
    <CatalogBrowser
      holds={[...holds, ...SAMPLE_HOLDS]}
      reviews={reviews}
      savedIds={savedIds}
      signedIn={user !== null}
    />
  );
}
