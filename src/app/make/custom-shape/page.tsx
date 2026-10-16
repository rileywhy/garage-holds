import type { Metadata } from "next";
import { CustomShapeLab } from "@/features/custom-shape-lab/custom-shape-lab";
export const metadata: Metadata = {
  title: "Custom Shape Lab",
  description:
    "Paint your own climbing hold, place mounting holes, and export a printable STL.",
};
export default function Page() {
  return (
    <main className="main-container lab-page">
      <div className="page-intro">
        <h1>Custom Shape Lab</h1>
        <p>
          Paint solid material, carve it back, and place screws. Your silhouette
          becomes a rounded hold with a flat mounting surface.
        </p>
      </div>
      <CustomShapeLab />
    </main>
  );
}
