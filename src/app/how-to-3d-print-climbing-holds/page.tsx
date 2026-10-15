import Link from "next/link";
import { GearLink } from "@/features/gear/gear-link";
import { AMAZON_DISCLOSURE, GEAR, amazonTag } from "@/features/gear/gear";
import { GUIDE, articleJsonLd, updatedLabel } from "@/features/guide/guide";
import { SITE_IMAGE, pageMetadata } from "@/lib/page-metadata";

// The guide shows the site image on link cards until it has a photo of
// its own (RIL-18).
export const metadata = pageMetadata({
  ...GUIDE,
  type: "article",
  image: SITE_IMAGE,
  article: {
    authors: [GUIDE.author],
    publishedTime: GUIDE.published,
    modifiedTime: GUIDE.updated,
  },
});

// The guide behind every "can I print this" question. One page, in the
// order a first-timer meets the questions, written to be found by search and
// kept to one pick per item so it stays readable.
export default function HowToPrintHoldsPage() {
  return (
    <main className="main-container gear-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd()) }}
      />
      <div className="page-intro">
        <p className="eyebrow">The guide</p>
        <h1>How to 3D print climbing holds</h1>
        <p>
          What you need to print climbing holds, the settings that keep one from
          breaking, and what to expect. Opinionated on purpose, one pick per
          item. Updated {updatedLabel(GUIDE.updated)} · by {GUIDE.author}.
          {amazonTag() && (
            <> Some links earn us a small commission, at no cost to you.</>
          )}
        </p>
      </div>

      <aside className="gear-short" aria-label="The short version">
        <h2>The short version</h2>
        <ul>
          <li>
            Printer: a <GearLink item={GEAR.printer} />.
          </li>
          <li>
            Filament: PETG, <GearLink item={GEAR.petg} />.
          </li>
          <li>
            Slicer: 8 walls, 25 to 40% infill, Layer height 0.2 mm, everything
            else default.
          </li>
          <li>Fuzzy skin on: 0.3 mm point distance, 0.4 to 0.5 mm thick.</li>
          <li>
            Mount with wood screws, snug not tight, and test it low first.
          </li>
        </ul>
      </aside>

      <nav className="gear-contents" aria-label="On this page">
        <a href="#can-you">Can you?</a>
        <a href="#what-you-need">What you need</a>
        <a href="#files">Get a hold file</a>
        <a href="#settings">Slicer settings</a>
        <a href="#mounting">Mounting</a>
        <a href="#strength">Do they hold up?</a>
        <a href="#questions">Short answers</a>
      </nav>

      <div className="gear-list">
        <section className="gear-item" id="can-you">
          <h2>Can you 3D print climbing holds?</h2>
          <p>
            Yes. Crimps, edges, pinches, slopers, footholds, and jugs all print
            well in PETG and climb well on a home wall or a board. Hold
            companies prototype shapes this way now, and some produce them this
            way. The rest of this page is what we have learned printing our own.
          </p>
        </section>

        <section className="gear-item" id="what-you-need">
          <h2>What you need</h2>
          <h3>A printer</h3>
          <p>
            The <GearLink item={GEAR.printer} /> is the one to get. It is cheap
            for what it does, it works out of the box with no tuning, and it has
            the best reviews of any printer in its price range by a wide margin.
            If you want an enclosed printer for ASA or nylon later, the{" "}
            <GearLink item={GEAR.printerEnclosed} /> is the same thing with a
            door.
          </p>
          <h3>PETG, not PLA</h3>
          <p>
            Print holds in PETG. PLA is the default filament on most printers
            and it makes a fine-looking hold, then it cracks at a screw hole the
            first time someone pulls hard. It is stiff and it shatters rather
            than bends. PETG gives a little, its layers stick to each other
            properly, and it costs the same.{" "}
            <a
              href="https://cnckitchen.com/blog/comparing-pla-petg-amp-asa-feat-prusament"
              rel="noopener"
              target="_blank"
            >
              CNC Kitchen&rsquo;s tests
            </a>{" "}
            show the difference if you want the numbers. Our pick is{" "}
            <GearLink item={GEAR.petg} />; on a Bambu,{" "}
            <GearLink item={GEAR.petgBambu} /> is tuned for the machine.
          </p>
          <h3>Dry filament, if it needs it</h3>
          <p>
            PETG absorbs moisture, and a damp spool prints stringy and bonds
            worse. A fresh spool prints fine, and we have gone a long time
            without drying anything. If prints go stringy or a hold snaps along
            a layer, dry the spool at about 60 °C for six hours in a{" "}
            <GearLink item={GEAR.dryer} /> and it comes back.
          </p>
        </section>

        <section className="gear-item" id="files">
          <h2>Get a hold file</h2>
          <p>
            Free climbing hold STL files are scattered across Thingiverse,
            MakerWorld, and Printables, mostly one-offs with no notes on how
            they printed or climbed. <Link href="/">The pile</Link> is a library
            of them in one place, each with its creator&rsquo;s print recipe,
            photos on a wall, and reviews from people who printed it, all free
            to download.
          </p>
          <p>
            Or shape your own. The <Link href="/make/crimp">crimp lab</Link>,{" "}
            <Link href="/make/sloper">sloper lab</Link>,{" "}
            <Link href="/make/jug">jug lab</Link> and{" "}
            <Link href="/make/foot">foot lab</Link> build a hold from a few
            sliders, show it on a 40° board, estimate the filament, and export
            an STL with the screw holes already in it, and the{" "}
            <Link href="/make/custom-shape">custom shape lab</Link> turns a
            drawing into one. No modelling needed.
          </p>
        </section>

        <section className="gear-item" id="settings">
          <h2>Slicer settings that matter</h2>
          <ul>
            <li>
              <strong>Walls: 8.</strong> Walls carry the load; infill mostly
              holds the walls apart. We run eight. Six is the floor. Leave
              &ldquo;ensure vertical shell thickness&rdquo; on (it is by default
              in PrusaSlicer, Bambu Studio and Orca): it is what makes those
              walls carry load on sloped surfaces, where the slicer would
              otherwise fill the slope with infill.
            </li>
            <li>
              <strong>Infill: 25 to 40%,</strong> gyroid or cubic. Go to the top
              of that range, or past it, on incut holds you can match or pull
              hard on. A sloper or a poor hold that only ever sees a push can
              sit at the bottom. Solid holds are not stronger, and they take all
              night.
            </li>
            <li>
              <strong>Fuzzy skin on,</strong> for grip. PETG comes out slick
              without it. We use a point distance of 0.3 mm and a thickness of
              0.4 to 0.5 mm, rougher than the slicer default.{" "}
              <a
                href="https://help.prusa3d.com/en/article/fuzzy-skin_246186/"
                rel="noopener"
                target="_blank"
              >
                Where to find it in the slicer.
              </a>{" "}
              The texture notes on each design page say what its creator used.
            </li>
          </ul>
          <p>
            Everything else, layer height included, can stay at your
            printer&rsquo;s default profile.
          </p>
        </section>

        <section className="gear-item" id="mounting">
          <h2>Mounting</h2>
          <p>
            Everything the labs make, and most printed holds, are screw-on. Use{" "}
            <GearLink item={GEAR.woodScrews} /> long enough to go through the
            hold and well into the wall, and stop at snug: a screw cranked into
            plastic splits it. Mount a new shape low and hang on it before you
            trust it high up.
          </p>
        </section>

        <section className="gear-item" id="strength">
          <h2>Do 3D printed climbing holds hold up?</h2>
          <p>
            Yes, printed the way this page says. People have had the same
            printed sets on boards for years, and when climbers on{" "}
            <a
              href="https://www.mountainproject.com/forum/topic/200377427/3d-printed-climbing-holds-strength-tested"
              rel="noopener"
              target="_blank"
            >
              Mountain Project
            </a>{" "}
            load-tested theirs, the screws gave out before the holds did. The
            failures that get reported are PLA cracking at the screws, damp
            filament delaminating, and screws cranked in until the plastic
            split.
          </p>
          <p>
            Look at holds now and then for cracks around the holes and retire
            any that show one. Read the recipe and reviews on the design page:
            they say what worked for the people who printed it, and that is
            worth more than any general rule here.
          </p>
        </section>

        <section className="gear-item" id="questions">
          <h2>Short answers</h2>
          <dl className="gear-faq">
            <dt>Best filament for 3D printed climbing holds?</dt>
            <dd>
              PETG. <GearLink item={GEAR.petg} /> is our pick. ASA if you have
              an enclosure and a sunny garage. Not PLA for anything you pull
              hard on.
            </dd>
            <dt>How long does a hold take to print?</dt>
            <dd>
              A crimp or foothold, one to two hours. A hand-sized jug or sloper,
              three to six. A set of ten is an overnight job on one printer.
            </dd>
            <dt>How much filament does a hold use?</dt>
            <dd>
              Roughly 30 to 60 g for a crimp and 80 to 150 g for a jug, so a 1
              kg spool is a wall&rsquo;s worth of small holds. The labs show the
              estimate for the exact shape as you change it.
            </dd>
            <dt>Can I sell holds I print?</dt>
            <dd>
              Only if the design&rsquo;s licence allows it; each design page
              shows its licence. Holds you shape in the labs are yours.
            </dd>
          </dl>
          <p>
            Ready to print something? <Link href="/">Browse the pile</Link> or
            shape your own in the <Link href="/make/crimp">crimp lab</Link>.
          </p>
        </section>
      </div>

      {amazonTag() && <p className="gear-disclosure">{AMAZON_DISCLOSURE}</p>}
    </main>
  );
}
