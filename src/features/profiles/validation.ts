export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 50;
export const BIO_MAX = 280;

// Letters and numbers from any script, plus spaces and . _ - between them.
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;

export function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function validateDisplayName(value: string): string[] {
  const name = normalizeDisplayName(value);
  if (name.length < DISPLAY_NAME_MIN || name.length > DISPLAY_NAME_MAX)
    return [
      `Display names are ${DISPLAY_NAME_MIN} to ${DISPLAY_NAME_MAX} characters.`,
    ];
  if (!DISPLAY_NAME_PATTERN.test(name))
    return [
      "Use letters, numbers, spaces, periods, underscores, or hyphens, starting with a letter or number.",
    ];
  return [];
}

export function normalizeBio(value: string) {
  return value.trim().replace(/\r\n/g, "\n");
}

export function validateBio(value: string): string[] {
  const bio = normalizeBio(value);
  if (bio.length > BIO_MAX)
    return [`Keep your bio under ${BIO_MAX} characters.`];
  if (/\p{Cc}/u.test(bio.replaceAll("\n", "")))
    return ["Your bio contains characters that can't be displayed."];
  return [];
}
