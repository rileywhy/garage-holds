import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ForceLab } from "@/features/force-lab/force-lab";
import { listPileHolds } from "@/features/force-lab/pile";

// Unlisted and temporary: not in the labs list, the navigation or the
// sitemap, and kept out of search results. Remove this route,
// src/features/force-lab, api/jug_force.py and tools/jug-force-lab
// together when it has served its purpose.
export const metadata: Metadata = {
  title: "Force Lab",
  description:
    "Load any Hold Lab hold, or one from the pile, on a wall and see the force on each screw, the wall and inside the print.",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ForceLabPage() {
  const pile = await listPileHolds();
  return (
    <main className="main-container lab-page">
      <nav className="lab-nav" aria-label="Hold Labs">
        <Link href="/make" className="lab-nav-back">
          <ChevronLeft size={14} aria-hidden="true" /> Hold Labs
        </Link>
      </nav>
      <div className="page-intro">
        <h1>Force Lab</h1>
      </div>
      <ForceLab pile={pile} />
    </main>
  );
}
