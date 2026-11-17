"use client";

import { useSyncExternalStore } from "react";

// Backgrounds match Viewer.setClearColor; these are display colors only.
const palettes = {
  light: {
    background: "#e4e4df",
    material: "#1d5fd1",
    materialFill: "#1d5fd138",
    hole: "#84581f",
    holeFill: "#84581f20",
    cut: "#b25270",
    cutFill: "#b2527080",
    grid: "#c6c6bf",
    ink: "#16181b",
    outline: "#fbfbf8",
  },
  dark: {
    background: "#242628",
    material: "#8db1f7",
    materialFill: "#8db1f74d",
    hole: "#e4c78f",
    holeFill: "#e4c78f26",
    cut: "#e79cb6",
    cutFill: "#e79cb680",
    grid: "#43464a",
    ink: "#eceae4",
    outline: "#242628",
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
