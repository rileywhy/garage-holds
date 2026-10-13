import type { Metadata } from "next";
import { HoldLab } from "@/features/hold-lab/hold-lab";
export const metadata: Metadata = {
  title: "Jug Lab",
  description:
    "Design a printable climbing jug with a rounded incut grip, curved arch and screw holes. Preview it on a 40° board and export an STL.",
};
export default function JugLabPage() {
  return (
    <main className="main-container lab-page">
      <div className="page-intro">
        <p className="eyebrow">a proper handful</p>
        <h1>jug lab</h1>
        <p>
          Shape a rounded board jug or deep jug. Find the bite, then export an
          STL.
        </p>
      </div>
      <HoldLab kind="jug" />
    </main>
  );
}
