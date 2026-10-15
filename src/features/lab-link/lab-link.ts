// Shareable lab links. The settings that differ from the generator's
// defaults ride in the query string, readable and editable by hand:
//
//   /make/crimp?edge_depth=22&incut=35&screws=false
//   /make/foot?preset=rock+tooth
//
// Nothing else is stored: the link is the design. A lab reads the query once
// when it starts, runs the values through the generator's own validation,
// and rewrites the query after every preview so the address bar always
// holds the shape on screen. The defaults come from the generator's schema,
// so the same code serves every lab.

export type LinkValue = number | boolean | string;
export type LinkParameters = Record<string, LinkValue>;

export const PRESET_KEY = "preset";

// Values the generator derives while a switch is on: the fitted screw span,
// the automatic seat, the size-based screw count. They are results, not
// choices, so a link leaves them out and the generator derives them again.
const DERIVED: Record<string, string> = {
  auto_spacing: "screw_spacing",
  auto_seat: "seat_depth",
  auto_screw_count: "screw_count",
};

function same(a: LinkValue, b: LinkValue) {
  return typeof a === "number" && typeof b === "number"
    ? Math.abs(a - b) < 1e-6
    : a === b;
}

// One value from the query, typed like the default it replaces. Anything
// that does not parse is ignored, so a mangled link still opens the lab.
export function parseLinkValue(raw: string, like: LinkValue): LinkValue | null {
  if (typeof like === "boolean") {
    if (raw === "true" || raw === "1") return true;
    if (raw === "false" || raw === "0") return false;
    return null;
  }
  if (typeof like === "number") {
    const value = Number(raw);
    return raw.trim() !== "" && Number.isFinite(value) ? value : null;
  }
  return raw.length <= 40 ? raw : null;
}

export function formatLinkValue(value: LinkValue): string {
  return typeof value === "number"
    ? String(Number(value.toFixed(4)))
    : String(value);
}

// The settings a link asks for, as a complete parameter set ready for the
// generator's validate action, or null when the query says nothing the lab
// understands. A preset is applied first; explicit values override it.
export function readLink(
  search: string,
  defaults: LinkParameters,
  presets: Record<string, LinkParameters> = {},
): { parameters: LinkParameters; preset: string | null } | null {
  const query = new URLSearchParams(search);
  const presetName = query.get(PRESET_KEY);
  const preset =
    presetName !== null && presetName in presets ? presetName : null;
  const parameters: LinkParameters = {
    ...defaults,
    ...(preset ? presets[preset] : {}),
  };
  let found = preset !== null;
  for (const [key, raw] of query) {
    if (!(key in defaults)) continue;
    const value = parseLinkValue(raw, defaults[key]);
    if (value === null) continue;
    parameters[key] = value;
    found = true;
  }
  return found ? { parameters, preset } : null;
}

// The query for the current settings: empty when they are the defaults, a
// preset name when they match one exactly, otherwise only the changed keys
// in the schema's own order.
export function linkSearch(
  parameters: LinkParameters,
  defaults: LinkParameters,
  presets: Record<string, LinkParameters> = {},
): string {
  const derived = new Set(
    Object.entries(DERIVED)
      .filter(([flag]) => parameters[flag] === true)
      .map(([, key]) => key),
  );
  const keys = Object.keys(defaults).filter((key) => !derived.has(key));
  const matches = (target: LinkParameters) =>
    keys.every((key) =>
      same(parameters[key] ?? defaults[key], target[key] ?? defaults[key]),
    );
  if (matches(defaults)) return "";
  for (const [name, preset] of Object.entries(presets))
    if (matches(preset))
      return `?${new URLSearchParams({ [PRESET_KEY]: name })}`;
  const query = new URLSearchParams();
  for (const key of keys) {
    const value = parameters[key];
    if (value !== undefined && !same(value, defaults[key]))
      query.set(key, formatLinkValue(value));
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

// Update the address bar in place, without a navigation or a history entry.
export function replaceSearch(search: string) {
  if (typeof window === "undefined") return;
  const { pathname, hash } = window.location;
  const next = pathname + search + hash;
  if (next !== pathname + window.location.search + hash)
    window.history.replaceState(window.history.state, "", next);
}

export function currentSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

// Copy the page address. The async clipboard needs a focused, secure page;
// when it refuses, the older select-and-copy route usually still works from
// a click. False when both fail, so the lab can point at the address bar.
export async function copyCurrentLink(): Promise<boolean> {
  const href = window.location.href;
  try {
    await navigator.clipboard.writeText(href);
    return true;
  } catch {
    /* Fall through to the legacy route. */
  }
  const field = document.createElement("textarea");
  field.value = href;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  field.remove();
  return copied;
}
