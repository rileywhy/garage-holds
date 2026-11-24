import { permanentRedirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/current-user";
import { HoldLab } from "@/features/hold-lab/hold-lab";
import { hasPinchSettings } from "@/features/lab-link/lab-link";
import { LabNav } from "@/features/labs/lab-nav";

export const metadata = {
  title: "Saved Pinch Lab design",
  robots: { index: false, follow: true },
};

export default async function PinchLabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!hasPinchSettings(Object.keys(await searchParams)))
    permanentRedirect("/make/roundpinch");
  const user = await getCurrentUser();
  return (
    <main className="main-container lab-page">
      <LabNav current="pinch" />
      <div className="page-intro">
        <h1>Classic Pinch Lab</h1>
      </div>
      <HoldLab kind="pinch" account={Boolean(user)} />
    </main>
  );
}
