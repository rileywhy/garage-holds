import { CustomShapeLab } from "@/features/custom-shape-lab/custom-shape-lab";
import { pageMetadata } from "@/lib/page-metadata";
export const metadata = pageMetadata({
  title: "Custom Shape Lab: draw a climbing hold, export an STL",
  description:
    "Paint your own climbing hold, place mounting holes, and export a printable STL.",
  path: "/make/custom-shape",
});
export default function Page() {
  return (
    <main className="main-container lab-page">
      <div className="page-intro">
        <p className="eyebrow eyebrow-tags">
          <span
            className="tag tag-tip tag-out-of-order"
            tabIndex={0}
            data-tip="This lab is being reworked. It still works, but expect rough edges, and complex drawings may be slow or fail to build."
          >
            out of order
          </span>
        </p>
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
