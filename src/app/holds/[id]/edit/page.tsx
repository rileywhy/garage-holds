import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EditDesignForm } from "@/features/holds/edit-design-form";
import { getHold } from "@/features/holds/repository";
import { getCurrentUser } from "@/features/auth/current-user";
import { signInPath } from "@/features/auth/redirects";

export const metadata: Metadata = {
  title: "Edit design",
  robots: { index: false, follow: false },
};

export default async function EditDesignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(signInPath(`/holds/${id}/edit`));
  const hold = await getHold(id);
  // Non-owners get the same 404 as a missing design, so the page reveals
  // nothing about drafts that exist.
  if (!hold || hold.ownerId !== user.id) notFound();
  return <EditDesignForm hold={hold} />;
}
