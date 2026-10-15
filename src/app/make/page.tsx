import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { pageMetadata } from "@/lib/page-metadata";
import styles from "./page.module.css";

export const metadata = pageMetadata({
  title: "Hold Labs",
  description:
    "Choose a climbing hold lab to design crimps, slopers, jugs, footholds, or your own custom shape and export an STL.",
  path: "/make",
});

const labs: {
  name: string;
  href: string;
  image: string;
  description: string;
  experimental?: boolean;
}[] = [
  {
    name: "Crimp Lab",
    href: "/make/crimp",
    image: "/images/hold-labs/crimp.webp",
    description:
      "Dial in a precise edge, adjust the incut, and soften the lip for your fingertips.",
  },
  {
    name: "Sloper Lab",
    href: "/make/sloper",
    image: "/images/hold-labs/sloper.webp",
    description:
      "Shape a rounded hold with broad curves and a surface built for open-hand grip.",
  },
  {
    name: "Jug Lab",
    href: "/make/jug",
    image: "/images/hold-labs/jug.webp",
    description:
      "Make a board jug, a deep jug, or a two-handed jug with a comfortable grabbing edge.",
  },
  {
    name: "Foot Lab",
    href: "/make/foot",
    image: "/images/hold-labs/foot.webp",
    description:
      "Board edges, toe-in edges, chips, smears, balls and dishes, sized for one, two or three screws.",
    experimental: true,
  },
  {
    name: "Custom Shape Lab",
    href: "/make/custom-shape",
    image: "/images/hold-labs/custom-shape.webp",
    description:
      "Paint your own silhouette, shape the grip, and place mounting holes where you need them.",
  },
];

export default function HoldLabsPage() {
  return (
    <main className={`main-container lab-page ${styles.page}`}>
      <div className="page-intro">
        <p className="eyebrow">make your next hold</p>
        <h1>Hold Labs</h1>
        <p>
          Choose a starting shape, make it your own, and export a printable STL.
        </p>
      </div>
      <div className={styles.grid}>
        {labs.map(({ name, href, image, description, experimental }) => (
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
                {experimental && <span className="tag">experimental</span>}
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
