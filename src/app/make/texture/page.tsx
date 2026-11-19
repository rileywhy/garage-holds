import Link from "next/link";
import { LabNav } from "@/features/labs/lab-nav";
import { TextureLab } from "@/features/textures/texture-lab";
import { pageMetadata } from "@/lib/page-metadata";
import type { SearchParams } from "@/features/holds/catalog-query";
import { savedTextureSources } from "@/features/textures/saved-sources";

export const metadata = pageMetadata({
  title: "Texture Lab",
  description:
    "Generate texture height maps for climbing holds, preview relief in 3D, and export a PNG for OrcaSlicer or an approximate STL.",
  path: "/make/texture",
});

export default async function TextureLabPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [query, { options, unavailable }] = await Promise.all([
    searchParams,
    savedTextureSources(),
  ]);
  const presetId = typeof query.preset === "string" ? query.preset : "";
  const holdId = typeof query.hold === "string" ? query.hold : "";
  const initialPreset = options.find(
    (option) => option.id === `preset:${presetId}`,
  );
  const initialSource = presetId
    ? initialPreset
    : holdId
      ? { link: `/holds/${encodeURIComponent(holdId)}` }
      : undefined;
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
      <TextureLab
        key={presetId || holdId}
        savedOptions={options}
        savedUnavailable={unavailable}
        initialSource={initialSource}
        initialError={
          presetId && !initialPreset
            ? "This preset is unavailable. Sign in to the account that saved it, or paste a lab link."
            : ""
        }
      />
    </main>
  );
}
