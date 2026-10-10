"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

// CSS follows the system theme when no explicit preference is set.
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    function sync() {
      const choice = document.documentElement.dataset.theme;
      setDark(choice === "dark" || (!choice && system.matches));
    }
    function storageChanged(event: StorageEvent) {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      if (event.newValue === "light" || event.newValue === "dark") {
        document.documentElement.dataset.theme = event.newValue;
      } else {
        delete document.documentElement.dataset.theme;
      }
      sync();
    }
    sync();
    system.addEventListener("change", sync);
    window.addEventListener("storage", storageChanged);
    return () => {
      system.removeEventListener("change", sync);
      window.removeEventListener("storage", storageChanged);
    };
  }, []);

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setDark(next === "dark");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The theme still works for this visit if persistent storage is blocked.
    }
  }

  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
