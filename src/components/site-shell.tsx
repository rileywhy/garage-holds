"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  Bookmark,
  Hammer,
  Mountain,
  Plus,
  FlaskConical,
} from "lucide-react";
import type { ReactNode } from "react";
import { FeedbackWidget } from "@/features/feedback/feedback-widget";
import { AMAZON_DISCLOSURE, TIP_URL, amazonTag } from "@/features/gear/gear";
import { ThemeToggle } from "./theme-toggle";

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
            href="/make/crimp"
            className={`nav-link ${pathname === "/make/crimp" ? "active" : ""}`}
          >
            <Hammer size={15} /> Crimp Lab
          </Link>
          <Link
            href="/make/sloper"
            className={`nav-link ${pathname === "/make/sloper" ? "active" : ""}`}
          >
            <FlaskConical size={15} /> sloper lab
          </Link>
          <Link
            href="/make/jug"
            className={`nav-link ${pathname === "/make/jug" ? "active" : ""}`}
          >
            <FlaskConical size={15} /> jug lab
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
        <Link href="/how-to-3d-print-climbing-holds">How to print holds</Link>
        {TIP_URL && (
          <a href={TIP_URL} rel="noopener" target="_blank">
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
