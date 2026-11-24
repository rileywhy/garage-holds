"use server";

import { getHold } from "@/features/holds/repository";
import { canImportStl } from "./source-options";

export async function textureHoldFile(id: string) {
  if (typeof id !== "string") return null;
  const hold = await getHold(id);
  if (hold?.status !== "published") return null;
  const file = hold.files.find(canImportStl);
  if (!file) return null;
  return { title: hold.title, url: file.url, orientation: file.orientation };
}
