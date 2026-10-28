"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";
import { LABS } from "./labs";
import { ARTWORK_FRAMING } from "./artwork-framing";

export function LabCarousel() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!playing || hovered || reduced.matches) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setActive((index) => (index + 1) % LABS.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [playing, hovered]);

  useEffect(() => {
    const viewport = track.current;
    if (!viewport) return;
    viewport.scrollTo({
      left: active * viewport.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [active]);

  function step(direction: number) {
    setPlaying(false);
    setActive((index) => (index + direction + LABS.length) % LABS.length);
  }

  return (
    <section
      className="lab-carousel"
      aria-label="Explore Hold Labs"
      aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setPlaying(false)}
    >
      <div className="lab-carousel-heading">
        <h2>Hold Labs</h2>
        <Link href="/make" className="lab-carousel-all">
          Open Hold Labs <ArrowUpRight size={14} />
        </Link>
      </div>
      <div className="lab-carousel-window">
        <div className="lab-carousel-track" ref={track}>
          {LABS.map((lab, index) => (
            <figure
              className="equipment-product lab-slide"
              key={lab.slug}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${LABS.length}: ${lab.name}`}
              inert={index !== active}
            >
              <Link
                href={lab.href}
                className="lab-artwork-frame"
                aria-label={`Open ${lab.name}`}
              >
                <img
                  style={{
                    width: `${ARTWORK_FRAMING[lab.slug].width}%`,
                    left: `${ARTWORK_FRAMING[lab.slug].left}%`,
                    top: `${ARTWORK_FRAMING[lab.slug].top}%`,
                  }}
                  src={lab.image}
                  alt={`Climbing hold made in ${lab.name}`}
                  width={1000}
                  height={625}
                  fetchPriority={index === 0 ? "high" : "auto"}
                />
              </Link>
              <figcaption>
                <Link href={lab.href}>
                  {lab.name} <ArrowUpRight size={16} />
                </Link>
                <span>{lab.description}</span>
              </figcaption>
            </figure>
          ))}
        </div>
        <button
          className="lab-carousel-arrow lab-carousel-prev"
          type="button"
          aria-label="Previous lab"
          onClick={() => step(-1)}
        >
          <ChevronLeft size={24} />
        </button>
        <button
          className="lab-carousel-arrow lab-carousel-next"
          type="button"
          aria-label="Next lab"
          onClick={() => step(1)}
        >
          <ChevronRight size={24} />
        </button>
        <div className="lab-carousel-menu">
          <div className="lab-carousel-dots" aria-label="Choose a lab">
            {LABS.map((lab, index) => (
              <button
                type="button"
                key={lab.slug}
                aria-label={`Show ${lab.name}`}
                aria-pressed={active === index}
                onClick={() => {
                  setPlaying(false);
                  setActive(index);
                }}
              >
                <span aria-hidden="true" />
              </button>
            ))}
          </div>
          <button
            className="lab-carousel-play"
            type="button"
            aria-label={playing ? "Pause lab slideshow" : "Play lab slideshow"}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
        </div>
      </div>
    </section>
  );
}
