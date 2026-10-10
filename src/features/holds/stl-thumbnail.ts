import { getAsset } from "@/lib/local-repository";
import { MAX_STL_PREVIEW_BYTES } from "./stl-limits";
import type { StlView } from "./stl-views";

const thumbnails = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
let queue: Promise<void> = Promise.resolve();
const MAX_CACHED_THUMBNAILS = 32;

export function getStlThumbnail(
  id: string,
  view: StlView = "side",
): Promise<string> {
  const key = `${id}:${view}`;
  const cached = thumbnails.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(key);
  if (existing) return existing;
  // One job at a time keeps geometry parsing and GPU use bounded while scrolling.
  const task = queue.then(async () => {
    const file = await getAsset(id);
    if (file.size > MAX_STL_PREVIEW_BYTES)
      throw new Error("This STL is too large for a browsing preview.");
    const { renderStlThumbnail } = await import("./stl-renderer");
    const thumbnail = renderStlThumbnail(await file.arrayBuffer(), view);
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
