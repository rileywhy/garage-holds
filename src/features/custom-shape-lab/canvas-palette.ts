"use client";

import { useSyncExternalStore } from "react";

// Backgrounds match Viewer.setClearColor; these are display colors only.
const palettes = {
  light: {
    background: "#eeece5",
    material: "#756395",
    materialFill: "#75639538",
    hole: "#84581f",
    holeFill: "#84581f20",
    cut: "#b25270",
    cutFill: "#b2527080",
    grid: "#cac5d0",
    ink: "#3f394a",
    outline: "#faf7ff",
  },
  dark: {
    background: "#303039",
    material: "#a18bc9",
    materialFill: "#a18bc94d",
    hole: "#e4c78f",
    holeFill: "#e4c78f26",
    cut: "#e79cb6",
    cutFill: "#e79cb680",
    grid: "#494553",
    ink: "#dfd9e9",
    outline: "#303039",
  },
};

function darkTheme() {
  const theme = document.documentElement.dataset.theme;
  return theme
    ? theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
}

function subscribe(changed: () => void) {
  const observer = new MutationObserver(changed);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  const system = matchMedia("(prefers-color-scheme: dark)");
  system.addEventListener("change", changed);
  return () => {
    observer.disconnect();
    system.removeEventListener("change", changed);
  };
}

export function useCanvasPalette() {
  const dark = useSyncExternalStore(subscribe, darkTheme, () => false);
  return palettes[dark ? "dark" : "light"];
}
