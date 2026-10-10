"use client";

import { useState } from "react";
import { Field } from "@/components/form-fields";
import { LicenseSummary } from "@/components/license-summary";
import {
  LICENSES,
  LICENSE_DETAILS,
  type License,
} from "@/features/holds/licenses";

export function LicenseField({
  defaultValue = "",
}: {
  defaultValue?: License | "";
}) {
  const [license, setLicense] = useState<License | "">(defaultValue);
  return (
    <>
      <Field
        label="How can others use your design? *"
        hint="All three choices allow modifications and file sharing. Select one to see what it permits."
      >
        <select
          name="license"
          value={license}
          required
          onChange={(event) => setLicense(event.target.value as License | "")}
        >
          <option value="" disabled>
            Choose sharing permissions…
          </option>
          {LICENSES.map((value) => (
            <option value={value} key={value}>
              {LICENSE_DETAILS[value].label}
            </option>
          ))}
        </select>
      </Field>
      <div aria-live="polite">
        {license && <LicenseSummary license={license} />}
      </div>
      <p className="license-explanation">
        After you publish, people who follow the license keep these permissions
        even if you remove the design or change its license later.
      </p>
      <p className="field-hint">
        Charging for a download doesn’t remove its sharing permissions. These
        choices cover copyright; patents and other rights are separate.
      </p>
    </>
  );
}
