import type { Metadata } from "next";
import Link from "next/link";
import { GearLink } from "@/features/gear/gear-link";
import { AMAZON_DISCLOSURE, GEAR, amazonTag } from "@/features/gear/gear";

const TITLE = "How to 3D print climbing holds (and what you need)";
const DESCRIPTION =
  "A practical guide to printing climbing holds for a home wall: which printer and filament, the slicer settings that keep a hold from breaking, how to mount it, and whether printed holds hold up.";

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
          What you need, the settings that keep a hold from breaking, how to
          mount it, and what to expect. Opinionated on purpose, one pick per
          item. Updated October 2026.
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
            to about a hand wide. Thousands of people climb on them. What a
            printer does not do well is big bolt-on jugs and volumes, where one
            bolt carries a long lever, or anything on a rope wall. Keep printed
            holds on bouldering and training walls with mats underneath.
          </p>
          <p>
            You will also read about printing a mould and casting urethane into
            it, which is how commercial holds are made. It works, and it gives
            you a real hold, but it is a second hobby with resin, release agent,
            and a lot of mess. This guide is about printing the hold itself.
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
            is the same machine with an enclosure. Nothing here needs more than
            that.
          </p>
          <h3>PETG, and why not PLA</h3>
          <p>
            Print holds in PETG. PLA is stiff and brittle, so it cracks at the
            screw holes and slowly creeps under a bolt; people do climb on PLA
            holds indoors, but it is the material in every breakage story. ABS
            and ASA are tougher but want an enclosure and ventilation. PETG
            prints on any machine, bonds well between layers, and flexes a
            little instead of snapping. It costs the same as PLA. Our pick is{" "}
            <GearLink item={GEAR.petg} />; <GearLink item={GEAR.petgBudget} />{" "}
            is a few dollars less and what half of the home wall forums print
            with. On a Bambu, <GearLink item={GEAR.petgBambu} /> is tuned for
            the machine.
          </p>
          <h3>Keep it dry</h3>
          <p>
            PETG drinks moisture, and a damp spool prints stringy and weak,
            which matters more on a hold than on a vase. A{" "}
            <GearLink item={GEAR.dryer} /> that feeds the printer while it dries
            is the easy answer. A sealed tub with{" "}
            <GearLink item={GEAR.desiccant} /> does the job for less.
          </p>
          <h3>Hardware</h3>
          <p>
            For screw-on holds, <GearLink item={GEAR.woodScrews} /> in 1 5/8″ to
            2 1/2″. For bolt-on, <GearLink item={GEAR.tNuts} /> behind the ply,{" "}
            <GearLink item={GEAR.bolts} />, and a{" "}
            <GearLink item={GEAR.drillBit} /> for the t-nut holes. Plus 3/4″
            plywood from the lumber yard, the one thing not worth ordering
            online. Details under mounting, below.
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
            an STL with the screw holes already in it. No modelling needed. If
            you do model, Blender, Fusion, and even Tinkercad all export STL;
            keep the back flat and the edges rounded.
          </p>
        </section>

        <section className="gear-item" id="settings">
          <h2>Slicer settings that matter</h2>
          <p>The settings people who print holds agree on, more or less:</p>
          <ul>
            <li>
              <strong>Flat back on the bed.</strong> Layers then run across the
              hold, so a pull on the lip loads them in shear rather than peeling
              them apart. Never print a hold standing on its edge.
            </li>
            <li>
              <strong>Walls over infill.</strong> Five walls, sometimes six.
              Walls carry the load; infill mostly holds the walls apart.
            </li>
            <li>
              <strong>25 to 40% infill.</strong> Gyroid or cubic. Solid holds
              are not stronger; a few people who printed at 100% report more
              cracking, not less, and they take all night.
            </li>
            <li>
              <strong>0.16 to 0.2 mm layers</strong> at a temperature on the
              warm side of your filament&rsquo;s range, for layer bonding.
            </li>
            <li>
              <strong>Fuzzy skin</strong> on the outside, a few tenths of a
              millimetre, for grip. PETG comes out slick without it. The texture
              notes on each design page say what its creator used.
            </li>
            <li>
              <strong>Bolt holes:</strong> pause the print just above the
              recess, drop a washer in, and resume. The washer spreads the bolt
              load across the hold instead of crushing a few layers.
            </li>
          </ul>
        </section>

        <section className="gear-item" id="mounting">
          <h2>Mounting</h2>
          <h3>Screw-on</h3>
          <p>
            Most printed holds, and everything the labs make, are screw-on. Use{" "}
            <GearLink item={GEAR.woodScrews} />, long enough to go through the
            hold and well into the ply: 1 5/8″ for small holds, 2″ to 2 1/2″ for
            anything deep. Star drive stops the bit camming out when you are up
            a ladder. Pre-drill the ply, and do not overtighten: snug, then a
            quarter turn. A screw cranked into plastic splits it.
          </p>
          <h3>Bolt-on</h3>
          <p>
            Bigger holds and anything you will move around mount with a bolt
            into a t-nut behind the ply. The standard is{" "}
            <GearLink item={GEAR.tNuts} /> on a 20 cm grid, with{" "}
            <GearLink item={GEAR.bolts} /> about 1″ longer than the hold is
            deep. The hole for the t-nut is a <GearLink item={GEAR.drillBit} />.
            Put a washer under the bolt head, and add a set screw on holds that
            could spin.
          </p>
          <h3>Chalk and a brush</h3>
          <p>
            Printed holds feel better chalked, and a{" "}
            <GearLink item={GEAR.brush} /> keeps the fuzzy skin working. Any{" "}
            <GearLink item={GEAR.chalk} /> does.
          </p>
        </section>

        <section className="gear-item" id="strength">
          <h2>Do 3D printed climbing holds hold up?</h2>
          <p>
            Small and medium holds in dry PETG, printed flat with five walls and
            30% or so infill, hold up fine on a home wall; people have had the
            same printed sets on boards for years. The failures that get
            reported are PLA cracking at the screws, damp filament delaminating,
            big holds bolted at one point, and screws cranked in until the
            plastic split. None of those is the printer&rsquo;s fault.
          </p>
          <p>
            Test every new shape by hand before you trust it: mount it low, hang
            on it, bounce on it. Look at holds now and then for cracks around
            the holes and retire any that show one. Keep printed holds off rope
            walls. Read the recipe and reviews on the design page: they say what
            worked for the people who printed it, and that is worth more than
            any general rule here.
          </p>
        </section>

        <section className="gear-item" id="questions">
          <h2>Short answers</h2>
          <dl className="gear-faq">
            <dt>Best filament for 3D printed climbing holds?</dt>
            <dd>
              PETG, dried. <GearLink item={GEAR.petg} /> is our pick. ASA if you
              have an enclosure and want more heat resistance for a sunny
              garage. Not PLA for anything you pull hard on.
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
            <dt>Should I print the hold or print a mould and cast it?</dt>
            <dd>
              Print the hold. Casting gives a hold closer to a commercial one
              but adds resin, release agent, and a weekend. Start with printed
              holds and cast later if you want to.
            </dd>
            <dt>Can I print holds for a MoonBoard or Tension Board?</dt>
            <dd>
              You can print screw-on holds that fit the ply between the t-nuts,
              and unofficial replicas of some discontinued sets exist. Official
              board holds are the board companies&rsquo; designs, and printed
              copies will not climb the same as the originals.
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
