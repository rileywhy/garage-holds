"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Copy,
  Mail,
  Mountain,
  Plus,
  FlaskConical,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { FeedbackWidget } from "@/features/feedback/feedback-widget";
import { AMAZON_DISCLOSURE, TIP_URL, amazonTag } from "@/features/gear/gear";
import { trackEvent } from "@/features/analytics/events";
import { ThemeToggle } from "./theme-toggle";

// Where general questions go; inlined at build time, like every
// NEXT_PUBLIC_ value, and absent until one is configured.
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";

export function SiteHeader({
  account,
  savedCount = 0,
}: {
  account?: ReactNode;
  savedCount?: number;
}) {
  const pathname = usePathname();
  return (
    <>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Garage Holds home">
          <span className="brand-icon">
            <Mountain size={23} strokeWidth={2.3} />
          </span>
          <span>garage holds</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link
            href="/"
            className={`nav-link ${pathname === "/" ? "active" : ""}`}
          >
            explore the pile
          </Link>
          <Link
            href="/saved"
            className={`nav-link ${pathname === "/saved" ? "active" : ""}`}
          >
            <Bookmark size={15} /> Saved
            {savedCount > 0 && <span className="nav-count">{savedCount}</span>}
          </Link>
          <Link
            href="/make"
            className={`nav-link ${pathname === "/make" || pathname.startsWith("/make/") ? "active" : ""}`}
            aria-current={
              pathname === "/make" || pathname.startsWith("/make/")
                ? "page"
                : undefined
            }
          >
            <FlaskConical size={15} /> Hold Labs
          </Link>
        </nav>
        <div className="header-actions">
          {account}
          <ThemeToggle />
          <Link href="/upload" className="button button-dark header-upload">
            <Plus size={16} /> Upload a design
          </Link>
        </div>
      </header>
      <div className="prototype-bar">
        <FlaskConical size={13} />
        <span>Early access · things may change while we test with makers.</span>
      </div>
    </>
  );
}

export function SiteFooter({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className="site-footer">
      <div>
        <span className="footer-wordmark">garage holds</span>
        <span>grips for your board.</span>
      </div>
      <div className="footer-links">
        <FeedbackWidget signedIn={signedIn} />
        {CONTACT_EMAIL && <ContactAddress email={CONTACT_EMAIL} />}
        <Link href="/how-to-3d-print-climbing-holds">How to print holds</Link>
        {TIP_URL && (
          <a
            href={TIP_URL}
            rel="noopener"
            target="_blank"
            onClick={() => trackEvent({ name: "tip_click" })}
          >
            Buy us a spool <ArrowUpRight size={15} />
          </a>
        )}
        <Link href="/upload">
          Made something good? Share it <ArrowUpRight size={15} />
        </Link>
      </div>
      {amazonTag() && <p className="footer-disclosure">{AMAZON_DISCLOSURE}</p>}
    </footer>
  );
}

// The address as a mailto link for people whose mail app is set up, and a
// copy button for everyone else: on many machines a mailto link opens
// nothing, or asks which app to use and then does nothing with it.
function ContactAddress({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
    } catch {
      // Clipboard access refused (an old browser or a plain http page):
      // the address is right there to select by hand.
      window
        .getSelection()
        ?.selectAllChildren(
          document.querySelector(".contact-address a") as Element,
        );
    }
  }
  return (
    <span className="contact-address">
      <a href={`mailto:${email}`}>
        <Mail size={15} /> {email}
      </a>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Email address copied" : "Copy email address"}
        title="Copy address"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </button>
    </span>
  );
}
