import Link from "next/link";
import { LEGAL, legalDateLabel } from "@/features/legal/legal";
import { SITE_IMAGE, pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Terms of use",
  description:
    "The terms for using Garage Holds: printing and climbing safely, what you can upload, and the limits of what the site promises.",
  path: "/terms",
  image: SITE_IMAGE,
});

// The terms (RIL-111), in the site's plain voice. Not reviewed by a lawyer;
// that was a deliberate choice for a free hobby site (RIL-113). Bump
// LEGAL.updated when what they say changes.
export default function TermsPage() {
  const mail = `mailto:${LEGAL.contact}`;
  return (
    <main className="main-container gear-page">
      <div className="page-intro">
        <h1>Terms of use</h1>
        <p>
          The deal for using Garage Holds. By browsing, downloading, signing in,
          or uploading, you agree to these terms and to how the{" "}
          <Link href="/privacy">privacy policy</Link> says your data is handled.
          Last updated {legalDateLabel(LEGAL.updated)}.
        </p>
      </div>

      <div className="gear-list">
        <section className="gear-item" id="safety">
          <h2>Safety first</h2>
          <p>
            Climbing is dangerous, and you&rsquo;ll be hanging your body weight
            on something you printed. Please read this part.
          </p>
          <ul>
            <li>
              Designs here are made by other climbers and are not tested by us.
              Shapes from the labs are generated, not engineered.
            </li>
            <li>
              How strong a printed hold is depends on your printer, material,
              settings, and how you mount it. The same file can print strong on
              one machine and weak on another.
            </li>
            <li>
              Test every new hold low to the ground. Inspect your holds before
              every session, and retire any that are cracked, loose, or flexing.
            </li>
            <li>
              Nothing on this site guarantees that a design will bear a load.
              You choose what to print and climb on, and you take that risk.
            </li>
          </ul>
        </section>

        <section className="gear-item" id="accounts">
          <h2>Accounts</h2>
          <p>
            You need to be 13 or older to make an account, and if you&rsquo;re
            under 18, a parent or guardian should be OK with it. One account per
            person; keep your sign-in to yourself. We can suspend or remove
            accounts and content that break these terms. To close your account,
            email <a href={mail}>{LEGAL.contact}</a>.
          </p>
        </section>

        <section className="gear-item" id="uploads">
          <h2>What you upload</h2>
          <p>
            Only upload files and photos you made or have permission to share.
            The license you pick decides what other people can do with your
            design. You keep ownership of your work.
          </p>
          <p>
            You let Garage Holds store your files, make copies the site needs
            (such as smaller photos and model previews), show them, and serve
            downloads under the license you chose, with your display name
            alongside. That permission ends when you delete the design, though
            copies people already downloaded keep the license they came with.
            Reviews you post may be shown on the design for as long as it is up.
          </p>
        </section>

        <section className="gear-item" id="rules">
          <h2>Not allowed</h2>
          <ul>
            <li>
              Anything illegal, or that infringes someone else&rsquo;s
              copyright, trademark, or other rights.
            </li>
            <li>
              Files that aren&rsquo;t what they say they are, or that carry
              malware.
            </li>
            <li>Spam, ads, and sales pitches.</li>
            <li>Harassment, hate, or sexual content.</li>
            <li>
              Claiming a design is load-tested, rated, or certified without
              saying how you tested it.
            </li>
            <li>
              Trying to break, overload, or get around the site&rsquo;s limits.
            </li>
          </ul>
        </section>

        <section className="gear-item" id="reports">
          <h2>Reports and takedowns</h2>
          <p>
            If a design copies your work or breaks these rules, use{" "}
            &ldquo;Report this design&rdquo; on its page or email{" "}
            <a href={mail}>{LEGAL.contact}</a> with the link and what&rsquo;s
            wrong. We remove what infringes, and accounts that keep uploading
            other people&rsquo;s work are closed.
          </p>
        </section>

        <section className="gear-item" id="links">
          <h2>Tips and links</h2>
          <p>
            Tips through Ko-fi are voluntary, don&rsquo;t buy anything, and are
            handled under Ko-fi&rsquo;s terms. Some gear links earn us a
            commission, as the note beside them says, at no cost to you.
          </p>
        </section>

        <section className="gear-item" id="disclaimer">
          <h2>No promises, limited liability</h2>
          <p>
            THE SITE, ITS DESIGNS, AND ITS LABS ARE PROVIDED &ldquo;AS IS&rdquo;
            AND &ldquo;AS AVAILABLE&rdquo;, WITHOUT WARRANTIES OF ANY KIND,
            INCLUDING THAT ANY DESIGN IS SAFE, STRONG, OR FIT FOR CLIMBING.
          </p>
          <p>
            To the fullest extent the law allows, Garage Holds is not liable for
            injury, damage, or loss that comes from printing, mounting, or
            climbing on a design from this site, or for any indirect or
            consequential loss. Where we are liable, the most we owe is the
            greater of what you paid us in the last 12 months or US$50.
          </p>
          <p>
            If something you upload, or your breaking these terms, gets Garage
            Holds into a legal claim, you agree to cover the reasonable costs of
            it.
          </p>
        </section>

        <section className="gear-item" id="law">
          <h2>Law, changes, and contact</h2>
          <p>
            These terms are governed by the laws of {LEGAL.state}, and any
            dispute is heard in the state or federal courts in {LEGAL.venue}.
            When the terms change, the date at the top changes; for a change
            that matters, we&rsquo;ll also post a notice on the site for 30
            days. Using the site after a change means you accept it. Questions
            go to <a href={mail}>{LEGAL.contact}</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
