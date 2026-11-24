import { getCurrentUser } from "@/features/auth/current-user";
import { HoldLab } from "@/features/hold-lab/hold-lab";
import { LabNav } from "@/features/labs/lab-nav";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Round Pinch Lab: 3D printable climbing pinch generator",
  description:
    "Design a printable climbing pinch hold with rounded, incut sides: a full round for the pads over a hollow for the fingertips, with screw holes or a bolt. Set the span, rounding and incut, preview it on a 40° board and export an STL.",
  path: "/make/roundpinch",
});

export default async function RoundPinchLabPage() {
  const user = await getCurrentUser();
  return (
    <main className="main-container lab-page">
      <LabNav current="roundpinch" />
      <div className="page-intro">
        <p className="eyebrow eyebrow-tags">
          <span
            className="tag tag-tip"
            tabIndex={0}
            data-tip="The controls for this experimental lab may still change. Tell us what breaks through the feedback link in the footer."
          >
            experimental
          </span>
        </p>
        <h1>Round Pinch Lab</h1>
      </div>
      <HoldLab kind="roundpinch" account={Boolean(user)} />
    </main>
  );
}
