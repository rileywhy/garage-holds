import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CatalogBrowser } from "@/features/holds/catalog-browser";
import { listSavedHolds } from "@/features/holds/repository";
import {
  parseCatalogQuery,
  type SearchParams,
} from "@/features/holds/catalog-query";
import { listAccountPresets } from "@/features/lab-presets/repository";
import { PresetList } from "@/features/lab-presets/preset-list";
import { getCurrentUser } from "@/features/auth/current-user";
import { signInPath } from "@/features/auth/redirects";

export const metadata: Metadata = { title: "Saved designs" };

export default async function SavedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath("/saved"));
  const query = parseCatalogQuery(await searchParams);
  const [page, presets] = await Promise.all([
    listSavedHolds(query),
    listAccountPresets(),
  ]);
  return (
    <CatalogBrowser
      page={page}
      query={query}
      savedIds={page.holds.map((hold) => hold.id)}
      signedIn
      savedOnly
      beforeLibrary={<PresetList presets={presets} />}
    />
  );
}
