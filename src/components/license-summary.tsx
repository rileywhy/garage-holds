import { LICENSE_DETAILS, type License } from "@/features/holds/licenses";

export function LicenseSummary({ license }: { license: License }) {
  const details = LICENSE_DETAILS[license];
  return (
    <div className="license-summary">
      <p>
        <strong>{details.label}</strong>
        <span>{license}</span>
      </p>
      <ul>
        {details.permissions.map((permission) => (
          <li key={permission}>{permission}</li>
        ))}
      </ul>
      <a href={details.url} target="_blank" rel="noreferrer">
        Full license terms
      </a>
    </div>
  );
}
