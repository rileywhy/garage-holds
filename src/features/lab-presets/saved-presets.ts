// Presets a person saves in a lab once a shape is how they like it. They
// live in this browser's localStorage, one list per lab, and show up in the
// starting-point menu under "my presets". A link or a settings file is how a
// shape leaves the browser; this is the quick way to come back to it.

export type PresetParameters = Record<string, number | boolean | string>;
export interface SavedPreset {
  name: string;
  parameters: PresetParameters;
  savedAt: string;
}

// Menu values for saved presets carry this prefix so a saved "Sloping rail"
// never collides with the generator's own.
export const SAVED_PREFIX = "mine:";
export const PRESET_LIMIT = 30;
export const NAME_LIMIT = 40;

type Store = Pick<Storage, "getItem" | "setItem">;

function browserStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function storageKey(lab: string) {
  return `garage-holds.presets.${lab}`;
}

export function isSavedValue(value: string) {
  return value.startsWith(SAVED_PREFIX);
}
export function savedValue(name: string) {
  return SAVED_PREFIX + name;
}
export function savedName(value: string) {
  return value.slice(SAVED_PREFIX.length);
}

// A clean name, or a message saying why the typed one will not do.
export function presetName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Give the preset a name.");
  if (name.length > NAME_LIMIT)
    throw new Error(`Keep the name under ${NAME_LIMIT} characters.`);
  return name;
}

export function loadSavedPresets(
  lab: string,
  store: Store | null = browserStore(),
): SavedPreset[] {
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(storageKey(lab)) ?? "null") as {
      version?: number;
      presets?: unknown;
    } | null;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.presets))
      return [];
    return parsed.presets.filter(
      (item): item is SavedPreset =>
        !!item &&
        typeof item === "object" &&
        typeof (item as SavedPreset).name === "string" &&
        typeof (item as SavedPreset).parameters === "object" &&
        (item as SavedPreset).parameters !== null &&
        !Array.isArray((item as SavedPreset).parameters),
    );
  } catch {
    return [];
  }
}

function write(lab: string, presets: SavedPreset[], store: Store) {
  try {
    store.setItem(storageKey(lab), JSON.stringify({ version: 1, presets }));
  } catch {
    throw new Error(
      "This browser would not store the preset. Save settings to a file instead.",
    );
  }
  return presets;
}

// Save or replace by name (case-insensitive). The newest sits first.
export function savePreset(
  lab: string,
  rawName: string,
  parameters: PresetParameters,
  store: Store | null = browserStore(),
  now: () => Date = () => new Date(),
): SavedPreset[] {
  const name = presetName(rawName);
  if (!store)
    throw new Error(
      "This browser cannot store presets. Save settings to a file instead.",
    );
  const others = loadSavedPresets(lab, store).filter(
    (p) => p.name.toLowerCase() !== name.toLowerCase(),
  );
  if (others.length >= PRESET_LIMIT)
    throw new Error(
      `You have ${PRESET_LIMIT} saved presets here. Delete one to make room.`,
    );
  return write(
    lab,
    [
      { name, parameters: { ...parameters }, savedAt: now().toISOString() },
      ...others,
    ],
    store,
  );
}

export function deletePreset(
  lab: string,
  name: string,
  store: Store | null = browserStore(),
): SavedPreset[] {
  if (!store) return [];
  return write(
    lab,
    loadSavedPresets(lab, store).filter((p) => p.name !== name),
    store,
  );
}
