import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { LABS } from "./labs";

// Above a lab's heading: the way back to the list of labs, and the other
// labs one tap away. The current lab is marked for assistive tech and
// styled as selected.
export function LabNav({ current }: { current: string }) {
  return (
    <nav className="lab-nav" aria-label="Hold Labs">
      <Link href="/make" className="lab-nav-back">
        <ChevronLeft size={14} aria-hidden="true" /> Hold Labs
      </Link>
      <ul>
        {LABS.map((lab) => (
          <li key={lab.slug}>
            <Link
              href={lab.href}
              aria-current={lab.slug === current ? "page" : undefined}
              title={lab.name}
            >
              {lab.short}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
