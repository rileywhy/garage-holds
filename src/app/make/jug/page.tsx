import { HoldLab } from "@/features/hold-lab/hold-lab";
import { LabNav } from "@/features/labs/lab-nav";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Jug Lab",
  description:
    "Design a printable climbing jug with a rounded incut grip, curved arch and screw holes. Preview it on a 40° board and export an STL.",
  path: "/make/jug",
});

export default function JugLabPage() {
  return (
    <main className="main-container lab-page">
      <LabNav current="jug" />
      <div className="page-intro">
        <p className="eyebrow">A PROPER HANDFUL</p>
        <h1>Jug Lab</h1>
        <p>
          Shape a board jug, a deep jug, or a two-handed jug. Find the bite,
          then export an STL.
        </p>
      </div>
      <HoldLab kind="jug" />
    </main>
  );
}
