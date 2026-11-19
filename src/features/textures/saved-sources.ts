import "server-only";

import { getCurrentUser } from "@/features/auth/current-user";
import { listAccountPresets } from "@/features/lab-presets/repository";
import { listSavedHolds } from "@/features/holds/repository";
import { DEFAULT_CATALOG_QUERY } from "@/features/holds/catalog-query";
import {
  canImportPreset,
  canImportStl,
  type HoldSourceOption,
} from "./source-options";

export async function savedTextureSources() {
  const options: HoldSourceOption[] = [];
  if (!(await getCurrentUser())) return { options, unavailable: false };
  const [presets, holds] = await Promise.allSettled([
    listAccountPresets(),
    listSavedHolds({ ...DEFAULT_CATALOG_QUERY, sort: "newest" }),
  ]);
  if (presets.status === "fulfilled") {
    for (const { id, name, lab, search } of presets.value) {
      if (!canImportPreset(lab)) continue;
      options.push({
        id: `preset:${id}`,
        label: name,
        lab,
        link: `/make/${lab}${search}`,
        group: "Lab presets",
      });
    }
  }
  if (holds.status === "fulfilled") {
    for (const hold of holds.value.holds) {
      if (hold.status !== "published" || !hold.files.some(canImportStl))
        continue;
      options.push({
        id: `hold:${hold.id}`,
        label: hold.title,
        link: `/holds/${hold.id}`,
        group: "Saved holds",
      });
    }
  }
  return {
    options,
    unavailable: presets.status === "rejected" || holds.status === "rejected",
  };
}
