import { getCurrentUser } from "@/features/auth/current-user";
import { HoldLab } from "@/features/hold-lab/hold-lab";
import { LabNav } from "@/features/labs/lab-nav";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Crimp Lab",
  description:
    "Shape a 3D printable climbing crimp: edge depth, incut, lip rounding, body shape, and screw holes, with a live preview and STL export.",
  path: "/make/crimp",
});

export default async function CrimpLabPage() {
  // Signed in, presets save to the account instead of this browser.
  const user = await getCurrentUser();
  return (
    <main className="main-container lab-page">
      <LabNav current="crimp" />
      <div className="page-intro">
        <p className="eyebrow">SHAPE YOUR NEXT EDGE</p>
        <h1>Crimp Lab</h1>
        <p>
          Start rounded. Find the curve, bite, and feel you want, then export an
          STL. Nothing is added to the library unless you upload it.
        </p>
      </div>
      <HoldLab kind="crimp" account={Boolean(user)} />
    </main>
  );
}
