import { fetchModel } from "./model-fetch";
import { freshPreviewUrl } from "./preview-actions";
import { MAX_STL_PREVIEW_BYTES } from "./stl-limits";
import type { Orientation } from "./orientation";

const thumbnails = new Map<string, HTMLCanvasElement>();
const pending = new Map<string, Promise<HTMLCanvasElement>>();
let queue: Promise<void> = Promise.resolve();
const MAX_CACHED_THUMBNAILS = 32;

// Fetches the STL from its signed URL; thumbnails are cached by file id,
// orientation and colour, so a refreshed URL for the same file never
// renders twice. A thumbnail is a canvas to draw from (see stl-renderer.ts),
// shared by every card showing it, so it is copied, never put on the page.
export function getStlThumbnail(
  file: { id: string; url: string; orientation: Orientation },
  color: string,
): Promise<HTMLCanvasElement> {
  const key = `${file.id}:${file.orientation}:${color}`;
  const cached = thumbnails.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(key);
  if (existing) return existing;
  // One job at a time keeps geometry parsing and GPU use bounded while scrolling.
  const task = queue.then(async () => {
    const bytes = await fetchModel(file.url, () => freshPreviewUrl(file.id));
    if (bytes.byteLength > MAX_STL_PREVIEW_BYTES)
      throw new Error("This STL is too large for a browsing preview.");
    const { renderStlThumbnail } = await import("./stl-renderer");
    const thumbnail = await renderStlThumbnail(bytes, file.orientation, color);
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
