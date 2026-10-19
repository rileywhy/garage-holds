import Link from "next/link";

// The short safety notice beside every download and lab export. The full
// one is the terms' first section (RIL-111).
export function SafetyNote() {
  return (
    <p className="field-hint safety-note">
      Printed holds are untested: their strength depends on your printer,
      material, settings, and mounting. Inspect every hold before you climb on
      it and retire cracked ones.{" "}
      <Link href="/terms#safety">Safety notice</Link>.
    </p>
  );
}
