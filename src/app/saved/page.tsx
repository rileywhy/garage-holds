import type { Metadata } from "next";
import { CatalogBrowser } from "@/features/holds/catalog-browser";
export const metadata: Metadata = { title: "Saved designs" };
export default function SavedPage() {
  return <CatalogBrowser savedOnly />;
}
