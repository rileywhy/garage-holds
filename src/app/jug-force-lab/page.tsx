import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ForceLab } from "@/features/force-lab/force-lab";

// Unlisted and temporary: not in the labs list, the navigation or the
// sitemap, and kept out of search results. Remove this route,
// src/features/force-lab, api/jug_force.py and tools/jug-force-lab
// together when it has served its purpose.
export const metadata: Metadata = {
  title: "Jug Force Lab",
  description:
    "Load a Jug Lab hold on a wall and see the force on each screw, the wall and the print layers.",
  robots: { index: false, follow: false, nocache: true },
};

export default function JugForceLabPage() {
  return (
    <main className="main-container lab-page">
      <nav className="lab-nav" aria-label="Hold Labs">
        <Link href="/make/jug" className="lab-nav-back">
          <ChevronLeft size={14} aria-hidden="true" /> Jug Lab
        </Link>
      </nav>
      <div className="page-intro">
        <h1>Jug Force Lab</h1>
      </div>
      <ForceLab />
    </main>
  );
}
