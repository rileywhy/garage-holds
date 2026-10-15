import { getCurrentUser } from "@/features/auth/current-user";
import { CustomShapeLab } from "@/features/custom-shape-lab/custom-shape-lab";
import { pageMetadata } from "@/lib/page-metadata";
import { LabNav } from "@/features/labs/lab-nav";

export const metadata = pageMetadata({
  title: "Custom Shape Lab",
  description:
    "Paint your own climbing hold, place mounting holes, and export a printable STL.",
  path: "/make/custom-shape",
});

export default async function Page() {
  // Signed in, presets save to the account instead of this browser.
  const user = await getCurrentUser();
  return (
    <main className="main-container lab-page">
      <LabNav current="custom-shape" />
      <div className="page-intro">
        <p className="eyebrow">PAINT YOUR NEXT HOLD</p>
        <h1>Custom Shape Lab</h1>
        <p>
          Paint solid material, carve it back, and place screws. Your silhouette
          becomes a rounded hold with a flat mounting surface.
        </p>
      </div>
      <CustomShapeLab account={Boolean(user)} />
    </main>
  );
}
