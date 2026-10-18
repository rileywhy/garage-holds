import { getCurrentUser } from "@/features/auth/current-user";
import { HoldLab } from "@/features/hold-lab/hold-lab";
import { LabNav } from "@/features/labs/lab-nav";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Pocket Lab",
  description:
    "Design a printable climbing pocket hold: a mono, two-finger or three-finger pocket in a round body, with screw holes. Set the opening, depth and floor angle, preview it on a 40° board and export an STL.",
  path: "/make/pocket",
});

export default async function PocketLabPage() {
  // Signed in, presets save to the account instead of this browser.
  const user = await getCurrentUser();
  return (
    <main className="main-container lab-page">
      <LabNav current="pocket" />
      <div className="page-intro">
        <p className="eyebrow eyebrow-tags">
          <span>FINGERS IN</span>
          <span
            className="tag tag-tip"
            tabIndex={0}
            data-tip="New lab. It generates, exports a closed solid and mounts, and the controls may still move around. Tell us what breaks through the feedback link in the footer."
          >
            experimental
          </span>
        </p>
        <h1>Pocket Lab</h1>
        <p>
          A mono, two-finger or three-finger pocket in a round body, open to the
          wall by default. Set the opening, depth and floor angle, then export
          an STL.
        </p>
      </div>
      <HoldLab kind="pocket" account={Boolean(user)} />
    </main>
  );
}
