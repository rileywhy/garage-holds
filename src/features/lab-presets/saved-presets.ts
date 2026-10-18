// Presets a person saves in a lab once a shape is how they like it. A
// preset is the lab's shareable link query, the one format every lab
// speaks, under a name. Signed in, presets live on the account (see
// actions.ts) and show under Saved; signed out, they live in this browser's
// localStorage, one list per lab. Either way they appear in the lab's
// starting-point menu under "My presets".

export type PresetLab =
  "crimp" | "sloper" | "jug" | "foot" | "pocket" | "pinch" | "custom-shape";
export const PRESET_LABS: PresetLab[] = [
  "crimp",
  "sloper",
  "jug",
  "foot",
  "pocket",
  "pinch",
  "custom-shape",
];
export const PRESET_LAB_NAMES: Record<PresetLab, string> = {
  crimp: "Crimp Lab",
  sloper: "Sloper Lab",
  jug: "Jug Lab",
  foot: "Foot Lab",
  pocket: "Pocket Lab",
  pinch: "Pinch Lab",
  "custom-shape": "Custom Shape Lab",
};

export interface LabPreset {
  // The row id on the account; the name itself in this browser.
  id: string;
  name: string;
  // The lab's link query ("?edge_depth=20"), empty for the default shape.
  search: string;
  savedAt: string;
}

// Menu values for saved presets carry this prefix so a saved "Sloping rail"
// never collides with the generator's own.
export const SAVED_PREFIX = "mine:";
export const PRESET_LIMIT = 30;
export const NAME_LIMIT = 40;
export const SEARCH_LIMIT = 6000;

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
export function savedValue(id: string) {
  return SAVED_PREFIX + id;
}
export function savedId(value: string) {
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

function number(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? String(Number(value.toFixed(1)))
    : null;
}

const FOOT_SHAPES: Record<string, string> = {
  edge: "Edge",
  ball: "Ball",
  rock: "Rock tooth",
  dish: "Dish",
};

// A name made from the settings that say most about the shape, so saving
// is one click and the menu still reads well: "22 mm edge · 10° incut".
export function defaultPresetName(lab: PresetLab, parameters: object): string {
  const p = parameters as Record<string, unknown>;
  const parts: (string | null)[] =
    lab === "crimp"
      ? [
          number(p.edge_depth) && `${number(p.edge_depth)} mm edge`,
          number(p.incut) && `${number(p.incut)}° incut`,
        ]
      : lab === "sloper"
        ? [
            number(p.width) && `${number(p.width)} mm wide`,
            number(p.incut) && `${number(p.incut)}° lift`,
          ]
        : lab === "jug"
          ? [
              number(p.width) && `${number(p.width)} mm jug`,
              number(p.grip_quality) && `${number(p.grip_quality)}% bite`,
            ]
          : lab === "foot"
            ? [
                typeof p.shape === "string"
                  ? (FOOT_SHAPES[p.shape] ?? p.shape)
                  : null,
                number(p.edge_depth) && `${number(p.edge_depth)} mm toe`,
                number(p.incut) && `${number(p.incut)}° bite`,
              ]
            : lab === "pocket"
              ? [
                  number(p.opening_width) &&
                    `${number(p.opening_width)} mm opening`,
                  p.through === true
                    ? "open to the wall"
                    : number(p.pocket_depth) &&
                      `${number(p.pocket_depth)} mm deep`,
                ]
              : lab === "pinch"
                ? [
                    number(p.width) && `${number(p.width)} mm pinch`,
                    typeof p.offset === "number" && p.offset > 0
                      ? `${number(p.offset)}% offset`
                      : number(p.depth) && `${number(p.depth)} mm deep`,
                  ]
                : [
                    number(p.scale) && `${number(p.scale)} mm wide`,
                    number(p.depth) && `${number(p.depth)} mm deep`,
                  ];
  const name = parts.filter(Boolean).join(" · ");
  return name || "Saved shape";
}

// "22 mm edge · 10° incut 2" when the plain name is already taken.
export function uniqueName(name: string, taken: string[]): string {
  const lower = new Set(taken.map((t) => t.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} ${n}`.slice(0, NAME_LIMIT);
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

// --- This browser --------------------------------------------------------

export function loadSavedPresets(
  lab: string,
  store: Store | null = browserStore(),
): LabPreset[] {
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(storageKey(lab)) ?? "null") as {
      version?: number;
      presets?: unknown;
    } | null;
    if (!parsed || parsed.version !== 2 || !Array.isArray(parsed.presets))
      return [];
    return parsed.presets.filter(
      (item): item is LabPreset =>
        !!item &&
        typeof item === "object" &&
        typeof (item as LabPreset).id === "string" &&
        typeof (item as LabPreset).name === "string" &&
        typeof (item as LabPreset).search === "string" &&
        typeof (item as LabPreset).savedAt === "string",
    );
  } catch {
    return [];
  }
}

function write(lab: string, presets: LabPreset[], store: Store) {
  try {
    store.setItem(storageKey(lab), JSON.stringify({ version: 2, presets }));
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
  search: string,
  store: Store | null = browserStore(),
  now: () => Date = () => new Date(),
): LabPreset[] {
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
    [{ id: name, name, search, savedAt: now().toISOString() }, ...others],
    store,
  );
}

export function renamePreset(
  lab: string,
  id: string,
  rawName: string,
  store: Store | null = browserStore(),
): LabPreset[] {
  const name = presetName(rawName);
  if (!store) return [];
  const presets = loadSavedPresets(lab, store);
  const found = presets.find((p) => p.id === id);
  if (!found) return presets;
  const clash = presets.find(
    (p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase(),
  );
  if (clash) throw new Error(`You already have a preset called “${name}”.`);
  return write(
    lab,
    presets.map((p) => (p.id === id ? { ...p, id: name, name } : p)),
    store,
  );
}

export function deletePreset(
  lab: string,
  id: string,
  store: Store | null = browserStore(),
): LabPreset[] {
  if (!store) return [];
  return write(
    lab,
    loadSavedPresets(lab, store).filter((p) => p.id !== id),
    store,
  );
}
