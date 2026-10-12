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
  // The preview image is a signed URL that expires after an hour, which is
  // enough for the first fetch a chat or social site makes when a link is
  // posted.
  const image = hold.photos[0]?.url;
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
      ...(image ? { images: [{ url: image, alt: hold.title }] } : {}),
    },
    twitter: { card: image ? "summary_large_image" : "summary" },
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
