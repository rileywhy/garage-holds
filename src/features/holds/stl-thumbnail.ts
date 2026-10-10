import { MAX_STL_PREVIEW_BYTES } from "./stl-limits";
import type { StlView } from "./stl-views";

const thumbnails = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
let queue: Promise<void> = Promise.resolve();
const MAX_CACHED_THUMBNAILS = 32;

// Fetches the STL from its signed URL; thumbnails are cached by file id, so a
// refreshed URL for the same file never renders twice.
export function getStlThumbnail(
  file: { id: string; url: string },
  view: StlView = "side",
): Promise<string> {
  const key = `${file.id}:${view}`;
  const cached = thumbnails.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(key);
  if (existing) return existing;
  // One job at a time keeps geometry parsing and GPU use bounded while scrolling.
  const task = queue.then(async () => {
    const response = await fetch(file.url);
    if (!response.ok) throw new Error("Could not load this STL.");
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_STL_PREVIEW_BYTES)
      throw new Error("This STL is too large for a browsing preview.");
    const { renderStlThumbnail } = await import("./stl-renderer");
    const thumbnail = renderStlThumbnail(bytes, view);
    thumbnails.set(key, thumbnail);
    if (thumbnails.size > MAX_CACHED_THUMBNAILS)
      thumbnails.delete(thumbnails.keys().next().value!);
    return thumbnail;
  });
  pending.set(key, task);
  queue = task.then(
    () => {
      pending.delete(key);
    },
    () => {
      pending.delete(key);
    },
  );
  return task;
}
