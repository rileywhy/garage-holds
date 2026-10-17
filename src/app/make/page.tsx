import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { pageMetadata } from "@/lib/page-metadata";
import { LABS } from "@/features/labs/labs";
import styles from "./page.module.css";

export const metadata = pageMetadata({
  title: "Hold Labs",
  description:
    "Choose a climbing hold lab to design crimps, slopers, jugs, footholds, or your own custom shape and export an STL.",
  path: "/make",
});

export default function HoldLabsPage() {
  return (
    <main className={`main-container lab-page ${styles.page}`}>
      <div className="page-intro">
        <h1>Hold Labs</h1>
        <p>
          Choose a starting shape, make it your own, and export a printable STL.
        </p>
      </div>
      <div className={styles.grid}>
        {LABS.map(({ name, href, image, description, status }) => (
          <Link
            key={href}
            href={href}
            className={styles.card}
            aria-label={`Open ${name}`}
          >
            <Image
              src={image}
              alt={`Default hold from ${name}`}
              width={1000}
              height={625}
              sizes="320px"
              className={styles.image}
            />
            <div className={styles.content}>
              <h2>
                {name}
                {status && (
                  <span
                    className={
                      status === "out of order" ? "tag tag-out-of-order" : "tag"
                    }
                  >
                    {status}
                  </span>
                )}
              </h2>
              <p>{description}</p>
              <span className={styles.action}>
                Open lab <ArrowUpRight size={16} aria-hidden="true" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
