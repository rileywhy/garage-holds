import Link from "next/link";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Add hold textures in OrcaSlicer",
  description:
    "Import a Garage Holds texture PNG into OrcaSlicer, paint it on a climbing hold, and bake the relief into the model.",
  path: "/orca-textures",
});

export default function OrcaTexturesPage() {
  return (
    <main className="main-container gear-page">
      <div className="page-intro">
        <h1>Add hold textures in OrcaSlicer</h1>
        <p>
          Use a grayscale PNG as a height map to raise ridges or carve grooves
          into a hold.
        </p>
      </div>
      <nav className="gear-contents" aria-label="On this page">
        <a href="#import">Import</a>
        <a href="#paint">Paint and scale</a>
        <a href="#grooves">Carve grooves</a>
        <a href="#bake">Bake and slice</a>
      </nav>
      <div className="gear-list">
        <section className="gear-item" id="import">
          <h2>Import a texture PNG</h2>
          <ol>
            <li>
              Open <Link href="/make/texture">Texture Lab</Link>, pick a
              pattern, and choose <strong>Download PNG for Orca</strong>.
            </li>
            <li>
              Open your hold STL in OrcaSlicer. In <strong>Prepare</strong>,
              select the hold and open <strong>Texture Displacement</strong>{" "}
              from the toolbar. If the tool is missing, check that your
              OrcaSlicer version includes Texture Displacement.
            </li>
            <li>
              Click the layer’s image to open the texture picker. Under{" "}
              <strong>My textures</strong>, click <strong>+</strong>, choose the
              PNG, then select its thumbnail. Orca keeps the image in your
              personal texture library.
            </li>
          </ol>
        </section>
        <section className="gear-item" id="paint">
          <h2>Paint and scale the texture</h2>
          <p>
            Brush over the gripping surface. Leave the mounting face, fastener
            holes, and seats clear. Turn on <strong>Edge fade</strong> to soften
            the transition at the edge of the painted patch.
          </p>
          <p>
            With <strong>Tile</strong> enabled, <strong>Tile size</strong> sets
            the width of one repeat in millimetres. For Sweeping Strata, try 60
            mm and a <strong>Depth</strong> of 0.3 mm. Larger tiles give the
            strokes more room to sweep across the hold.
          </p>
        </section>
        <section className="gear-item" id="grooves">
          <h2>Raise ridges or carve grooves</h2>
          <p>
            Open <strong>More settings</strong> for <strong>Invert</strong> and{" "}
            <strong>Midlevel</strong>. Midlevel sets which gray stays at the
            original surface. Orca’s base layer uses <strong>Add</strong> for
            both raised and recessed relief.
          </p>
          <ul>
            <li>
              <strong>Black-background patterns</strong> such as Sweeping Strata
              start with Invert off and Midlevel 0 for raised strokes. For
              grooves, turn Invert on and set Midlevel to 1.
            </li>
            <li>
              <strong>White-background Dimples</strong> start with Invert off
              and Midlevel 1 so the dark marks cut inward.
            </li>
          </ul>
        </section>
        <section className="gear-item" id="bake">
          <h2>Bake and check the slice</h2>
          <p>
            Orbit the hold and check the placement, then choose{" "}
            <strong>Bake</strong> to turn the height map into mesh geometry. If
            the baked strokes look faceted or vanish, increase the bake quality
            or subdivide in Pro mode.
          </p>
          <p>
            Slice and inspect the layer preview around the texture and the
            hardware. Save a 3MF project with the editable texture settings
            before baking if you want to revise the paint later.
          </p>
          <p>
            <a href="https://www.orcaslicer.com/wiki/print_prepare/prepare_texture_displacement">
              OrcaSlicer Texture Displacement documentation
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
