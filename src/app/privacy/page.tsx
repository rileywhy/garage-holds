import Link from "next/link";
import { LEGAL, legalDateLabel } from "@/features/legal/legal";
import { SITE_IMAGE, pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Privacy policy",
  description:
    "What Garage Holds collects, why, who handles it, how long it is kept, and how to see or delete your data.",
  path: "/privacy",
  image: SITE_IMAGE,
});

// What the code does today, not what it might do (RIL-112). When a change
// alters what is collected, kept, or shared, change this page in the same
// pull request and bump LEGAL.updated. Planned changes: RIL-113.
export default function PrivacyPage() {
  const mail = `mailto:${LEGAL.contact}`;
  return (
    <main className="main-container gear-page">
      <div className="page-intro">
        <h1>Privacy policy</h1>
        <p>
          Garage Holds is a small site run from {LEGAL.state}. It collects what
          it needs to run accounts and share designs, nothing for advertising,
          and it doesn&rsquo;t sell anything about you. Last updated{" "}
          {legalDateLabel(LEGAL.updated)}.
        </p>
      </div>

      <div className="gear-list">
        <section className="gear-item" id="collect">
          <h2>What we collect</h2>
          <h3>Browsing</h3>
          <p>
            You can browse, download, and use the labs without an account.
            Visits are counted with Vercel Web Analytics, which uses no cookies
            and doesn&rsquo;t follow you to other sites. Along with page views
            it records a few actions, such as a file download or an STL export
            and which design it was, but nothing that identifies you.
          </p>
          <h3>Your account</h3>
          <p>
            Signing in needs an email address. If you sign in with Google,
            Google also shares your name and profile picture: your name becomes
            your display name, which you can change, and the picture&rsquo;s
            address is stored but not shown. Your display name and bio are
            public, alongside your designs and reviews. Your email address is
            not.
          </p>
          <h3>What you post</h3>
          <p>
            Published designs are public: their details, files, photos, the
            files&rsquo; original names, and your reviews of other designs.
            Location and camera details are removed from photos when they
            upload. Drafts are visible only to you, and an upload abandoned
            halfway is deleted within a day.
          </p>
          <h3>Private to you</h3>
          <p>
            Saved holds and saved lab settings. Signed out, lab settings stay in
            your browser instead. Photos sent from your phone with the QR code
            wait in a private inbox and are deleted within a day if they
            aren&rsquo;t added to a design.
          </p>
          <h3>Feedback and reports</h3>
          <p>
            The feedback and &ldquo;Report this design&rdquo; forms store your
            message and the page you sent it from. Signed in, your display name
            and email go with it; signed out, only the contact details you
            choose to add. Each message is also forwarded to a private Discord
            channel that only the person running the site reads.
          </p>
          <h3>Technical data</h3>
          <p>
            Like any website, our host sees your IP address. It is used to stop
            abuse, such as limiting how often one address can send feedback, and
            the site itself doesn&rsquo;t store it. When a page breaks, the site
            sends itself an alert with the page&rsquo;s address pattern and the
            error, never your details. Server logs are kept for about an hour.
          </p>
        </section>

        <section className="gear-item" id="storage">
          <h2>Cookies and browser storage</h2>
          <p>
            Signing in sets the cookies that keep you signed in. Your browser
            also remembers your light or dark theme and, when signed out, your
            saved lab settings. That is all. There are no advertising or
            tracking cookies. The &ldquo;Sign in with Google&rdquo; button on
            the sign-in page is loaded from Google, which may set its own
            cookies there.
          </p>
        </section>

        <section className="gear-item" id="who">
          <h2>Who handles your data</h2>
          <p>
            We use these services to run the site, and they handle data only to
            provide it: Vercel (hosting and visit counts), Supabase (accounts
            and the database), Cloudflare R2 (files and photos), Brevo (sign-in
            code emails), Google (sign-in with Google and our support email),
            and Discord (feedback and alerts to the site&rsquo;s owner). They
            may process data in the United States.
          </p>
          <p>
            Some links leave the site: tips go through Ko-fi, and gear links go
            to Amazon. Those sites have their own privacy policies. We
            don&rsquo;t sell or share personal data for advertising.
          </p>
        </section>

        <section className="gear-item" id="keep">
          <h2>How long it&rsquo;s kept</h2>
          <p>
            Your account, designs, reviews, and saved items are kept until you
            delete them or your account. Feedback is kept for as long as it is
            useful, and deleted sooner if you ask. Abandoned uploads and phone
            inbox photos are deleted within a day.
          </p>
        </section>

        <section className="gear-item" id="choices">
          <h2>Seeing, changing, and deleting your data</h2>
          <p>
            You can change your display name and bio on your{" "}
            <Link href="/account">account page</Link>, delete a design and its
            files from its edit page, and remove saved holds and lab settings
            yourself.
          </p>
          <p>
            To delete your account or a review, or to get a copy of your data,
            email <a href={mail}>{LEGAL.contact}</a> from the address you sign
            in with. We&rsquo;ll do it within 30 days. Deleting an account
            removes your profile, designs, files, photos, reviews, saved holds,
            and lab settings; feedback you sent stays, without your name.
          </p>
        </section>

        <section className="gear-item" id="eu-uk">
          <h2>If you&rsquo;re in the EU or UK</h2>
          <p>
            We use your data to provide the account and features you ask for,
            and, for security, preventing abuse, fixing errors, and counting
            visits without cookies, because we have a legitimate interest in
            running the site safely. You can ask to see, correct, delete, or
            export your data, or object to or limit how we use it, at the
            address below. You can also complain to your data protection
            authority.
          </p>
        </section>

        <section className="gear-item" id="children">
          <h2>Children</h2>
          <p>
            Accounts are for people 13 and older. If you&rsquo;re under 18, ask
            a parent or guardian first. If we learn that someone under 13 has an
            account, we&rsquo;ll delete it.
          </p>
        </section>

        <section className="gear-item" id="changes">
          <h2>Changes and contact</h2>
          <p>
            When this policy changes, the date at the top changes. For a change
            that matters, such as collecting something new, we&rsquo;ll also
            post a notice on the site for 30 days. Questions go to{" "}
            <a href={mail}>{LEGAL.contact}</a>. The{" "}
            <Link href="/terms">terms of use</Link> cover the rest.
          </p>
        </section>
      </div>
    </main>
  );
}
