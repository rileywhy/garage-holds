import type { Metadata } from "next";
import { SAMPLE_HOLDS } from "@/features/holds/sample-data";
import { HoldDetail } from "@/features/holds/hold-detail";

type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const hold = SAMPLE_HOLDS.find((hold) => hold.id === id);
  return hold
    ? { title: hold.title, description: hold.description }
    : { title: "Your hold design", robots: { index: false, follow: false } };
}
export default async function HoldPage({ params }: Props) {
  const { id } = await params;
  return <HoldDetail id={id} />;
}
