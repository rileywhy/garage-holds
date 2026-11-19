import Link from "next/link";
import { LabNav } from "@/features/labs/lab-nav";
import { TextureLab } from "@/features/textures/texture-lab";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Texture Lab",
  description:
    "Generate texture height maps for climbing holds, preview relief in 3D, and export a PNG for OrcaSlicer or an approximate STL.",
  path: "/make/texture",
});

export default function TextureLabPage() {
  return (
    <main className="main-container lab-page">
      <LabNav current="texture" />
      <div className="page-intro">
        <h1>Texture Lab</h1>
        <p>
          Make a height map and try it on a climbing hold.{" "}
          <Link href="/orca-textures">OrcaSlicer import guide</Link>
        </p>
      </div>
      <TextureLab />
    </main>
  );
}
