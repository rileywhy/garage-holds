import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SAMPLE_HOLDS } from "@/features/holds/sample-data";
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
  return SAMPLE_HOLDS.find((hold) => hold.id === id) ?? (await getHold(id));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const hold = await loadHold((await params).id);
  return hold && hold.status === "published"
    ? { title: hold.title, description: hold.description }
    : { title: "Hold design", robots: { index: false, follow: false } };
}

export default async function HoldPage({ params }: Props) {
  const { id } = await params;
  const hold = await loadHold(id);
  if (!hold) notFound();
  const user = await getCurrentUser();
  const [reviews, savedIds] = await Promise.all([
    hold.isSample ? Promise.resolve([]) : listReviews(hold.id),
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
