import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UploadForm } from "@/features/uploads/upload-form";
import { getCurrentUser } from "@/features/auth/current-user";
import { signInPath, welcomePath } from "@/features/auth/redirects";

export const metadata: Metadata = { title: "Upload a design" };

export default async function UploadPage() {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath("/upload"));
  if (!user.onboarded) redirect(welcomePath("/upload"));
  return <UploadForm creator={user.displayName} />;
}
