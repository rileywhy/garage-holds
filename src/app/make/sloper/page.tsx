import { getCurrentUser } from "@/features/auth/current-user";
import { HoldLab } from "@/features/hold-lab/hold-lab";
import { LabNav } from "@/features/labs/lab-nav";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Sloper Lab",
  description:
    "Design a printable climbing sloper with adjustable curve, incut, shape and screw holes. Preview it on a 40° board and export an STL.",
  path: "/make/sloper",
});

export default async function SloperLabPage() {
  // Signed in, presets save to the account instead of this browser.
  const user = await getCurrentUser();
  return (
    <main className="main-container lab-page">
      <LabNav current="sloper" />
      <div className="page-intro">
        <p className="eyebrow">SHAPE YOUR NEXT SLOPER</p>
        <h1>Sloper Lab</h1>
        <p>Start rounded. Find your curve and slope, then export an STL.</p>
      </div>
      <HoldLab kind="sloper" account={Boolean(user)} />
    </main>
  );
}
