"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Viewer, ViewName } from "@/features/model-viewer/viewer";
import { MAX_STL_PREVIEW_BYTES } from "./stl-limits";
import type { Orientation } from "./orientation";

// An STL to show: a file already in storage, or one still in the browser
// before upload. `key` tells one model from another.
export type ModelSource =
  { key: string; url: string } | { key: string; file: File };

export interface ModelViewerOptions {
  orientation: Orientation;
  color: string;
  // The view and turntable to start with; later changes go through the
  // viewer itself.
  view: ViewName;
  turning: boolean;
}

// Loads an STL into the shared viewer inside `container`, and turns it
// again, without reloading, whenever the orientation changes. The viewer is
// reachable through the returned ref once `ready`.
export function useModelViewer(
  container: RefObject<HTMLDivElement | null>,
  source: ModelSource,
  options: ModelViewerOptions,
) {
  const viewer = useRef<Viewer | null>(null);
  const bytes = useRef<ArrayBuffer | null>(null);
  const latest = useRef(options);
  // Tagged with the source it was loaded for, so a changed source reads as
  // "loading" without resetting state inside the effect.
  const [loaded, setLoaded] = useState({ key: "", failed: false });
  const url = "url" in source ? source.url : "";
  const file = "file" in source ? source.file : null;
  const { key } = source;

  useEffect(() => {
    latest.current = options;
  }, [options]);

  useEffect(() => {
    const box = container.current;
    if (!box) return;
    let active = true;
    let created: Viewer | null = null;
    (async () => {
      const [{ Viewer, isDarkTheme }, { holdGeometry }, data] =
        await Promise.all([
          import("@/features/model-viewer/viewer"),
          import("./stl-scene"),
          file
            ? file.arrayBuffer()
            : fetch(url).then((response) => {
                if (!response.ok) throw new Error("Could not load this STL.");
                return response.arrayBuffer();
              }),
        ]);
      if (data.byteLength > MAX_STL_PREVIEW_BYTES)
        throw new Error("This STL is too large for a browsing preview.");
      const { orientation, color, view, turning } = latest.current;
      const geometry = holdGeometry(data, orientation);
      if (!active) {
        geometry.dispose();
        return;
      }
      created = new Viewer(box, {
        dark: isDarkTheme(),
        color: parseInt(color.replace("#", ""), 16),
      });
      created.setView(view);
      created.setGeometry(geometry);
      created.setTurning(turning);
      bytes.current = data;
      viewer.current = created;
      setLoaded({ key, failed: false });
    })().catch(() => {
      if (active) setLoaded({ key, failed: true });
    });
    return () => {
      active = false;
      viewer.current = null;
      bytes.current = null;
      created?.dispose();
    };
  }, [container, key, url, file]);

  // A new orientation turns the loaded model in place; the camera stays
  // where the user left it so the change is easy to read.
  const { orientation } = options;
  useEffect(() => {
    const current = viewer.current;
    const data = bytes.current;
    if (!current || !data) return;
    import("./stl-scene").then(({ holdGeometry }) => {
      if (viewer.current === current)
        current.setGeometry(holdGeometry(data, orientation));
    });
  }, [orientation]);

  return {
    viewer,
    ready: loaded.key === key && !loaded.failed,
    failed: loaded.key === key && loaded.failed,
  };
}
