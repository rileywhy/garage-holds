import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HoldDetail } from "@/features/holds/hold-detail";
import {
  getHold,
  listReviews,
  listSavedIds,
} from "@/features/holds/repository";
import { getCurrentUser } from "@/features/auth/current-user";
import type { Hold } from "@/features/holds/types";

type Props = { params: Promise<{ id: string }> };

async function loadHold(id: string): Promise<Hold | null> {
  return getHold(id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const hold = await loadHold((await params).id);
  if (!hold || hold.status !== "published")
    return { title: "Hold design", robots: { index: false, follow: false } };
  // The preview image is served from this origin by /holds/<id>/og so it
  // never expires; the photo id in the address busts caches when the photo
  // changes. Without a photo the site-wide opengraph-image applies.
  const photo = hold.photos[0];
  const description = `${hold.type} · ${hold.size} · ${hold.mount}. ${hold.description}`;
  return {
    title: hold.title,
    description: hold.description,
    alternates: { canonical: `/holds/${hold.id}` },
    openGraph: {
      type: "article",
      title: hold.title,
      description,
      url: `/holds/${hold.id}`,
      ...(photo
        ? {
            images: [
              { url: `/holds/${hold.id}/og?v=${photo.id}`, alt: hold.title },
            ],
          }
        : {}),
    },
  };
}

export default async function HoldPage({ params }: Props) {
  const { id } = await params;
  const hold = await loadHold(id);
  if (!hold) notFound();
  const user = await getCurrentUser();
  const [reviews, savedIds] = await Promise.all([
    listReviews(hold.id),
    user ? listSavedIds() : Promise.resolve<string[]>([]),
  ]);
  return (
    <HoldDetail
      hold={hold}
      reviews={reviews}
      saved={savedIds.includes(hold.id)}
      signedIn={user !== null}
      viewerId={user?.id ?? null}
    />
  );
}
