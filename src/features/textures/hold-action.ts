"use server";

import { getHold } from "@/features/holds/repository";
import { MAX_STL_PREVIEW_BYTES } from "@/features/holds/stl-limits";

export async function textureHoldFile(id: string) {
  if (typeof id !== "string") return null;
  const hold = await getHold(id);
  if (hold?.status !== "published") return null;
  const file = hold.files.find(
    (entry) =>
      entry.extension.replace(/^\./, "").toLowerCase() === "stl" &&
      entry.bytes <= MAX_STL_PREVIEW_BYTES &&
      entry.url,
  );
  if (!file) return null;
  return { title: hold.title, url: file.url, orientation: file.orientation };
}
