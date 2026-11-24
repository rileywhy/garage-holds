import { HoldLab } from "@/features/hold-lab/hold-lab";
import { LabNav } from "@/features/labs/lab-nav";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Round Pinch Lab",
  description:
    "Design a printable climbing pinch hold with rounded, incut sides: a full round for the pads over a hollow for the fingertips, with screw holes or a bolt. Set the span, rounding and incut, preview it on a 40° board and export an STL.",
  path: "/make/roundpinch",
});

export default async function RoundPinchLabPage() {
  return (
    <main className="main-container lab-page">
      <LabNav current="roundpinch" />
      <div className="page-intro">
        <p className="eyebrow eyebrow-tags">
          <span
            className="tag tag-tip"
            tabIndex={0}
            data-tip="A second take on the pinch, with rounder, more incut sides. The Pinch Lab is still there to compare it with, and the controls may still move around. Tell us what breaks through the feedback link in the footer."
          >
            experimental
          </span>
        </p>
        <h1>Round Pinch Lab</h1>
      </div>
      {/* Presets stay in this browser while the lab is on trial: saving to
          the account needs "roundpinch" added to the lab_presets check in a
          migration, once the lab is kept. */}
      <HoldLab kind="roundpinch" account={false} />
    </main>
  );
}
