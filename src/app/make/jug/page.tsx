import { getCurrentUser } from "@/features/auth/current-user";
import { HoldLab } from "@/features/hold-lab/hold-lab";
import { LabNav } from "@/features/labs/lab-nav";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Jug Lab: 3D printable climbing jug generator",
  description:
    "Design a printable climbing jug with a rounded incut grip, curved arch and screw holes. Preview it on a 40° board and export an STL.",
  path: "/make/jug",
});

export default async function JugLabPage() {
  // Signed in, presets save to the account instead of this browser.
  const user = await getCurrentUser();
  return (
    <main className="main-container lab-page">
      <LabNav current="jug" />
      <div className="page-intro">
        <h1>Jug Lab</h1>
        <p>
          Shape a board jug, a deep jug, or a two-handed jug, then export an
          STL.
        </p>
      </div>
      <HoldLab kind="jug" account={Boolean(user)} />
    </main>
  );
}
