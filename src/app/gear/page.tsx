import type { Metadata } from "next";
import Link from "next/link";
import { GearLink } from "@/features/gear/gear-link";
import { AMAZON_DISCLOSURE, GEAR, amazonTag } from "@/features/gear/gear";

export const metadata: Metadata = {
  title: "What you need to 3D print climbing holds",
  description:
    "A short, opinionated list for printing climbing holds at home: which printer, why PETG, how to keep filament dry, and the screws, t-nuts, and bits that keep a hold on the wall.",
  alternates: { canonical: "/gear" },
  openGraph: {
    title: "What you need to 3D print climbing holds",
    description:
      "One printer, one filament, and the hardware that keeps a printed hold on a home wall.",
    url: "/gear",
  },
};

// The guide behind every "what do I print this with" question, written to be
// found by search and kept to one pick per item so it stays readable.
export default function GearPage() {
  return (
    <main className="main-container gear-page">
      <div className="page-intro">
        <p className="eyebrow">before you print</p>
        <h1>what you need to 3D print climbing holds</h1>
        <p>
          One printer, one filament, and the hardware that keeps a hold on the
          wall. One pick each, with the reason. Swap freely; the recipe on each
          design page says what its creator used.
        </p>
      </div>

      <div className="gear-list">
        <section className="gear-item" id="printer">
          <h2>a printer</h2>
          <p>
            Any current printer with a 200 mm bed prints every hold in the pile.
            The <GearLink item={GEAR.printer} /> is the cheap sure thing: fast,
            quiet, and tuned for PETG out of the box. If you want a door on it
            for ASA or nylon later, the <GearLink item={GEAR.printerEnclosed} />{" "}
            is the same machine with an enclosure. Nothing here needs more than
            that.
          </p>
        </section>

        <section className="gear-item" id="filament">
          <h2>PETG, and why not PLA</h2>
          <p>
            Print holds in PETG. PLA is stiff and brittle, so it cracks at the
            screw holes and slowly creeps under a bolt. ABS and ASA are tougher
            but want an enclosure and ventilation. PETG prints on any machine,
            bonds well between layers, and flexes a little instead of snapping.
            It costs the same as PLA. Our pick is <GearLink item={GEAR.petg} />;{" "}
            <GearLink item={GEAR.petgBudget} /> is a few dollars less and what
            half of the home wall forums print with. On a Bambu,{" "}
            <GearLink item={GEAR.petgBambu} /> is tuned for the machine.
          </p>
          <p>
            PETG comes out slick. The fuzzy skin option in your slicer, or the
            texture notes on a design page, is how people get grip back.
          </p>
        </section>

        <section className="gear-item" id="dry">
          <h2>keep it dry</h2>
          <p>
            PETG drinks moisture, and a damp spool prints stringy and weak,
            which matters more on a hold than on a vase. A{" "}
            <GearLink item={GEAR.dryer} /> that feeds the printer while it dries
            is the easy answer. A sealed tub with{" "}
            <GearLink item={GEAR.desiccant} /> does the job for less.
          </p>
        </section>

        <section className="gear-item" id="screws">
          <h2>screw-on: wood screws</h2>
          <p>
            Most printed holds, and everything the labs make, are screw-on. Use{" "}
            <GearLink item={GEAR.woodScrews} />, long enough to go through the
            hold and well into the ply: 1 5/8″ for small holds, 2″ to 2 1/2″ for
            anything deep. Star drive stops the bit camming out when you are up
            a ladder. Pre-drill the hold if the recipe says to.
          </p>
        </section>

        <section className="gear-item" id="bolts">
          <h2>bolt-on: t-nuts and bolts</h2>
          <p>
            Bigger holds and anything you will move around mount with a bolt
            into a t-nut behind the ply. The standard is{" "}
            <GearLink item={GEAR.tNuts} /> on a 20 cm grid, with{" "}
            <GearLink item={GEAR.bolts} /> about 1″ longer than the hold is
            deep. The hole for the t-nut is a <GearLink item={GEAR.drillBit} />.
            Use 3/4″ plywood from the lumber yard; it is the one thing not worth
            ordering online.
          </p>
        </section>

        <section className="gear-item" id="chalk">
          <h2>chalk and a brush</h2>
          <p>
            Printed holds feel better chalked, and a{" "}
            <GearLink item={GEAR.brush} /> keeps the texture working. Any{" "}
            <GearLink item={GEAR.chalk} /> does.
          </p>
        </section>

        <section className="gear-item" id="strength">
          <h2>does a printed hold hold up?</h2>
          <p>
            Small and medium holds in PETG, printed flat back down with four or
            more walls and around 30% infill, hold up fine on a home wall. The
            failures people report are PLA cracking at the screws, damp
            filament, and big holds bolted at one point. Test every new shape by
            hand before you trust it, keep anything printed off lead walls, and
            read the recipe and reviews on the design page: they say what worked
            for the people who printed it.
          </p>
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
