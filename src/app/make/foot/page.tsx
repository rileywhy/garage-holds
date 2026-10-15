import { HoldLab } from "@/features/hold-lab/hold-lab";
import { LabNav } from "@/features/labs/lab-nav";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Foot Lab",
  description:
    "Design a printable climbing foothold: board edges, toe-in edges, chips, smears, balls and dishes with screw holes. Preview it on a 40° board and export an STL.",
  path: "/make/foot",
});

export default function FootLabPage() {
  return (
    <main className="main-container lab-page">
      <LabNav current="foot" />
      <div className="page-intro">
        <p className="eyebrow eyebrow-tags">
          <span>feet first</span>
          <span
            className="tag tag-tip"
            tabIndex={0}
            data-tip="New lab. It generates, exports a closed solid and mounts, and the controls may still move around. Tell us what breaks through the feedback link in the footer."
          >
            experimental
          </span>
        </p>
        <h1>foot lab</h1>
        <p>
          Positive edges, neutral chips, slopey wedges, balls and dishes. Pick a
          starting point, dial in the bite, then export an STL.
        </p>
      </div>
      <HoldLab kind="foot" />
    </main>
  );
}
