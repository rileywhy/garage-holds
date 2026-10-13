import type { Metadata } from "next";
import Link from "next/link";
import { GearLink } from "@/features/gear/gear-link";
import { AMAZON_DISCLOSURE, GEAR, amazonTag } from "@/features/gear/gear";

const TITLE = "How to 3D print climbing holds (and what you need)";
const DESCRIPTION =
  "A practical guide to printing climbing holds for a home wall: which printer and filament, the slicer settings that keep a hold from breaking, and whether printed holds hold up.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/how-to-3d-print-climbing-holds" },
  openGraph: {
    type: "article",
    title: TITLE,
    description: DESCRIPTION,
    url: "/how-to-3d-print-climbing-holds",
  },
};

// A source for a claim, shown as a small link after the sentence.
function Source({ href, children }: { href: string; children: string }) {
  return (
    <a className="gear-source" href={href} rel="noopener" target="_blank">
      {children}
    </a>
  );
}

// The guide behind every "can I print this" question. One page, in the
// order a first-timer meets the questions, written to be found by search and
// kept to one pick per item so it stays readable.
export default function HowToPrintHoldsPage() {
  return (
    <main className="main-container gear-page">
      <div className="page-intro">
        <p className="eyebrow">The guide</p>
        <h1>How to 3D print climbing holds</h1>
        <p>
          What you need, the settings that keep a hold from breaking, and what
          to expect. Opinionated on purpose, one pick per item. Updated October
          2026.
        </p>
      </div>

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
            Yes. Small and medium holds printed in PETG work well on a home wall
            or a board: crimps, edges, pinches, slopers, footholds, and jugs up
            to about a hand wide. Hold companies now prototype and even produce
            holds this way.{" "}
            <Source href="https://climbingbusinessjournal.com/3d-hold-printing-gets-real/">
              Climbing Business Journal
            </Source>{" "}
            What a printer does not do well is big bolt-on jugs and volumes,
            where one bolt carries a long lever, or anything on a rope wall.
            Keep printed holds on bouldering and training walls with mats
            underneath.
          </p>
        </section>

        <section className="gear-item" id="what-you-need">
          <h2>What you need</h2>
          <h3>A printer</h3>
          <p>
            Any current printer with a 200 mm bed prints every hold in the pile.
            The <GearLink item={GEAR.printer} /> is the cheap sure thing: fast,
            quiet, and tuned for PETG out of the box. If you want a door on it
            for ASA or nylon later, the <GearLink item={GEAR.printerEnclosed} />{" "}
            is the same machine with an enclosure.
          </p>
          <h3>PETG, and why not PLA</h3>
          <p>
            Print holds in PETG. PLA is a little stronger in a straight pull but
            brittle: it snaps rather than bends, and its layers bond less well,
            so it cracks at the screw holes.{" "}
            <Source href="https://cnckitchen.com/blog/comparing-pla-petg-amp-asa-feat-prusament">
              CNC Kitchen
            </Source>{" "}
            PETG flexes a little instead, bonds well between layers, prints on
            any machine, and costs the same. Run it on the warm side of the
            spool&rsquo;s range; layer bonding improves with temperature.{" "}
            <Source href="https://www.cnckitchen.com/blog/the-influence-of-extrusion-temperature-on-layer-adhesion">
              CNC Kitchen
            </Source>{" "}
            Our pick is <GearLink item={GEAR.petg} />;{" "}
            <GearLink item={GEAR.petgBudget} /> is a few dollars less, and on a
            Bambu <GearLink item={GEAR.petgBambu} /> is tuned for the machine.
          </p>
          <h3>Dry filament, if it needs it</h3>
          <p>
            PETG absorbs moisture, and a damp spool prints stringy and bonds
            worse. A fresh spool from a sealed bag prints fine, and we have gone
            a long time without drying anything. If prints go stringy or a hold
            snaps along a layer, dry the spool at about 60 °C for six hours, in
            a <GearLink item={GEAR.dryer} /> or an oven that holds the
            temperature, and store it with <GearLink item={GEAR.desiccant} />.{" "}
            <Source href="https://polymaker.com/the-top-5-reasons-petg-filament-strings-on-3d-prints/">
              Polymaker
            </Source>
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
            <Link href="/make/sloper">sloper lab</Link>, and{" "}
            <Link href="/make/jug">jug lab</Link> build a hold from a few
            sliders, show it on a 40° board, estimate the filament, and export
            an STL with the screw holes already in it. No modelling needed.
          </p>
        </section>

        <section className="gear-item" id="settings">
          <h2>Slicer settings that matter</h2>
          <ul>
            <li>
              <strong>Walls: 8.</strong> Walls carry the load; infill mostly
              holds the walls apart. We run eight. Six is the floor.
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
              0.4 to 0.5 mm, which is rougher than the slicer default.{" "}
              <Source href="https://help.prusa3d.com/en/article/fuzzy-skin_246186/">
                Prusa Knowledge Base
              </Source>{" "}
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
            Small and medium holds in PETG, with plenty of walls, hold up fine
            on a home wall; people have had the same printed sets on boards for
            years, and climbers who have load-tested them report the hold
            outlasting the screws.{" "}
            <Source href="https://www.mountainproject.com/forum/topic/200377427/3d-printed-climbing-holds-strength-tested">
              Mountain Project
            </Source>{" "}
            The failures that get reported are PLA cracking at the screws, damp
            filament delaminating, big holds mounted at one point, and screws
            cranked in until the plastic split. None of those is the
            printer&rsquo;s fault.
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
