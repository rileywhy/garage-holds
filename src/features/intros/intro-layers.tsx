"use client";

import { useEffect, useLayoutEffect, useRef, type AnimationEvent } from "react";
import { usePathname } from "next/navigation";
import {
  INTRO_ATTRIBUTE,
  LIGHT_STORAGE_KEY,
  isLabsPath,
  lightDue,
  type Intro,
} from "./intros";

// Longer than either animation: the layer always comes off, even if the
// browser never reports the animation ending.
const GIVE_UP_MS = 3200;

// The door's four sections, top to bottom, each pressed with four panels
// (two on a phone). The name is on the second section, the handle on the last.
const DOOR_SECTIONS = [0, 1, 2, 3];
const DOOR_PANELS = [0, 1, 2, 3];

function reducedMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function playing() {
  return document.documentElement.hasAttribute(INTRO_ATTRIBUTE);
}

function finish() {
  document.documentElement.removeAttribute(INTRO_ATTRIBUTE);
}

function start(intro: Intro) {
  if (reducedMotion() || playing()) return;
  document.documentElement.setAttribute(INTRO_ATTRIBUTE, intro);
  setTimeout(finish, GIVE_UP_MS);
}

// True when the shop light is due, and records that it has now come on.
// Blocked storage means no light, never a light on every visit.
function takeLightTurn() {
  try {
    const now = Date.now();
    if (!lightDue(now, localStorage.getItem(LIGHT_STORAGE_KEY))) return false;
    localStorage.setItem(LIGHT_STORAGE_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

// The layers are always in the page and hidden; <html data-intro> shows one.
// Layout effects set it before the browser paints the page underneath, so a
// navigation never shows the new page for a frame first.
export function IntroLayers({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const wasSignedIn = useRef(signedIn);
  const wasInLabs = useRef<boolean | null>(null);

  // Signing in keeps this layout mounted and flips signedIn, which a page
  // loaded by someone already signed in never does.
  useLayoutEffect(() => {
    if (signedIn && !wasSignedIn.current) start("door");
    wasSignedIn.current = signedIn;
  }, [signedIn]);

  // Walking into the labs from elsewhere on the site. A full page load is
  // decided earlier, by LIGHT_INITIALIZATION_SCRIPT in the document head.
  useLayoutEffect(() => {
    const inLabs = isLabsPath(pathname);
    const entered = wasInLabs.current === false && inLabs;
    wasInLabs.current = inLabs;
    if (entered && !reducedMotion() && !playing() && takeLightTurn())
      start("light");
  }, [pathname]);

  useEffect(() => {
    // An intro the head script began still needs its way off.
    const giveUp = playing() ? setTimeout(finish, GIVE_UP_MS) : undefined;
    const events = ["pointerdown", "keydown", "wheel", "touchmove"] as const;
    for (const name of events)
      window.addEventListener(name, finish, { passive: true });
    return () => {
      clearTimeout(giveUp);
      for (const name of events) window.removeEventListener(name, finish);
    };
  }, []);

  function ended(event: AnimationEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) finish();
  }

  return (
    <div className="intro-layers" aria-hidden="true">
      <div className="intro-door" onAnimationEnd={ended}>
        {DOOR_SECTIONS.map((section) => (
          <div className="intro-door-section" key={section}>
            {DOOR_PANELS.map((panel) => (
              <span className="intro-door-panel" key={panel} />
            ))}
            {section === 1 && (
              <span className="intro-door-name">
                <span className="brand-icon" />
                Garage Holds
              </span>
            )}
            {section === 3 && <span className="intro-door-handle" />}
          </div>
        ))}
        <div className="intro-door-spill" />
      </div>
      <div className="intro-light" onAnimationEnd={ended}>
        <div className="intro-light-dark" />
        <div className="intro-light-room" />
        <div className="intro-light-cone" />
        <div className="intro-light-fixture">
          <div className="intro-light-housing" />
          <div className="intro-light-tube" />
        </div>
      </div>
    </div>
  );
}
