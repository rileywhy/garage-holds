import { SloperLab } from "@/features/sloper-lab/sloper-lab";
import { LabNav } from "@/features/labs/lab-nav";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Sloper Lab",
  description:
    "Design a printable climbing sloper with adjustable curve, incut, shape and screw holes. Preview it on a 40° board and export an STL.",
  path: "/make/sloper",
});

export default function SloperLabPage() {
  return (
    <main className="main-container lab-page">
      <LabNav current="sloper" />
      <div className="page-intro">
        <p className="eyebrow">shape your next sloper</p>
        <h1>sloper lab</h1>
        <p>Start rounded. Find your curve and slope, then export an STL.</p>
      </div>
      <SloperLab />
    </main>
  );
}
