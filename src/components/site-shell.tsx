"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  Bookmark,
  Mountain,
  Plus,
  FlaskConical,
} from "lucide-react";
import type { ReactNode } from "react";
import { useLibrary } from "./library-provider";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader({ account }: { account?: ReactNode }) {
  const pathname = usePathname();
  const { savedIds } = useLibrary();
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
            Explore
          </Link>
          <Link
            href="/saved"
            className={`nav-link ${pathname === "/saved" ? "active" : ""}`}
          >
            <Bookmark size={15} /> Saved
            {savedIds.length > 0 && (
              <span className="nav-count">{savedIds.length}</span>
            )}
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
        <span>
          Local prototype · uploads, reviews, and saved holds stay in this
          browser.
        </span>
      </div>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <span className="footer-wordmark">garage holds</span>
        <span>Printable climbing holds for your home wall.</span>
      </div>
      <Link href="/upload">
        Made something good? Share it <ArrowUpRight size={15} />
      </Link>
    </footer>
  );
}
