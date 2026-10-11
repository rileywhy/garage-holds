import type { Metadata } from "next";
import { CrimpLab } from "@/features/crimp-lab/crimp-lab";

export const metadata: Metadata = {
  title: "Crimp Lab",
  description:
    "Shape a 3D printable climbing crimp: edge depth, incut, lip rounding, body shape, and screw holes, with a live preview and STL export.",
};

export default function CrimpLabPage() {
  return (
    <main className="main-container lab-page">
      <div className="page-intro">
        <p className="eyebrow">SHAPE YOUR NEXT EDGE</p>
        <h1>Crimp Lab</h1>
        <p>
          Start rounded. Find the curve, bite, and feel you want, then export an
          STL. Nothing is added to the library unless you upload it.
        </p>
      </div>
      <CrimpLab />
    </main>
  );
}
