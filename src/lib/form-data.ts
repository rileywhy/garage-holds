export function optionalNumber(
  value: FormDataEntryValue | null,
): number | null {
  return typeof value === "string" && value.trim() !== ""
    ? Number(value)
    : null;
}
