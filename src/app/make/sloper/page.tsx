import type { Metadata } from "next";
import { SloperLab } from "@/features/sloper-lab/sloper-lab";

export const metadata: Metadata = {
  title: "Sloper Lab",
  description:
    "Design a printable climbing sloper with adjustable curve, incut, shape and screw holes. Preview it on a 40° board and export an STL.",
};

export default function SloperLabPage() {
  return (
    <main className="main-container lab-page">
      <div className="page-intro">
        <p className="eyebrow">shape your next sloper</p>
        <h1>sloper lab</h1>
        <p>Start rounded. Find your curve and slope, then export an STL.</p>
      </div>
      <SloperLab />
    </main>
  );
}
