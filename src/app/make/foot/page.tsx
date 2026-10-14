import type { Metadata } from "next";
import { HoldLab } from "@/features/hold-lab/hold-lab";
export const metadata: Metadata = {
  title: "Foot Lab",
  robots: { index: false, follow: false },
};
export default function FootLabPage() {
  return (
    <main className="main-container lab-page">
      <div className="page-intro">
        <p className="eyebrow">local shapes, ready to try</p>
        <h1>foot lab</h1>
        <p>
          Positive edges, slopey dishes, balls and rock-inspired feet. Scale it,
          find the bite, and export an STL.
        </p>
      </div>
      <HoldLab kind="foot" />
    </main>
  );
}
