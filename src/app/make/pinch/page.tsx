import { getCurrentUser } from "@/features/auth/current-user";
import { HoldLab } from "@/features/hold-lab/hold-lab";
import { LabNav } from "@/features/labs/lab-nav";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Pinch Lab",
  description:
    "Design a printable climbing pinch hold: a block gripped between thumb and fingers, with screw holes or a bolt. Set the span, lean or undercut each side, offset the top, preview it on a 40° board and export an STL.",
  path: "/make/pinch",
});

export default async function PinchLabPage() {
  // Signed in, presets save to the account instead of this browser.
  const user = await getCurrentUser();
  return (
    <main className="main-container lab-page">
      <LabNav current="pinch" />
      <div className="page-intro">
        <p className="eyebrow eyebrow-tags">
          <span>THUMB AND FINGERS</span>
          <span
            className="tag tag-tip"
            tabIndex={0}
            data-tip="New lab. It generates, exports a closed solid and mounts, and the controls may still move around. Tell us what breaks through the feedback link in the footer."
          >
            experimental
          </span>
        </p>
        <h1>Pinch Lab</h1>
        <p>
          A block you squeeze between thumb and fingers. Set the span, lean or
          undercut each side, offset the top for one hand, then export an STL.
        </p>
      </div>
      <HoldLab kind="pinch" account={Boolean(user)} />
    </main>
  );
}
