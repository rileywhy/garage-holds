import Link from "next/link";
import { getCurrentUser } from "@/features/auth/current-user";
import { HoldLab } from "@/features/hold-lab/hold-lab";
import { LabNav } from "@/features/labs/lab-nav";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Crack Lab",
  description:
    "Design a printable crack climbing trainer for finger, hand or fist jams: one block with the crack through it, or one side to print twice. Set the width and depth, flare it or add a constriction for locks, preview it on a 40° board and export an STL.",
  path: "/make/crack",
});

export default async function CrackLabPage() {
  // Signed in, presets save to the account instead of this browser.
  const user = await getCurrentUser();
  return (
    <main className="main-container lab-page">
      <LabNav current="crack" />
      <div className="page-intro">
        <p className="eyebrow eyebrow-tags">
          <span>JAMS AND LOCKS</span>
          <span
            className="tag tag-tip"
            tabIndex={0}
            data-tip="New lab. It generates, exports a closed solid and mounts, and the controls may still move around. Tell us what breaks through the feedback link in the footer."
          >
            experimental
          </span>
        </p>
        <h1>Crack Lab</h1>
        <p>
          A crack to jam fingers, hands or fists in. Set its width and depth,
          flare it or add a constriction for locks, then export an STL: one
          block, or one side to print twice and mount apart. It prints on its
          back and stands tall, so keep the guide&rsquo;s{" "}
          <Link href="/how-to-3d-print-climbing-holds#settings">
            walls and vertical shell thickness
          </Link>
          .
        </p>
      </div>
      <HoldLab kind="crack" account={Boolean(user)} />
    </main>
  );
}
