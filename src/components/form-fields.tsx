import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactNode,
  type ReactElement,
} from "react";

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const controls = Children.map(children, (child) => {
    if (
      !isValidElement(child) ||
      !["input", "select", "textarea"].includes(String(child.type))
    )
      return child;
    return cloneElement(
      child as ReactElement<{ id?: string; "aria-describedby"?: string }>,
      { id, "aria-describedby": hint ? `${id}-hint` : undefined },
    );
  });
  return (
    <div className={`form-field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {controls}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}

export function FieldErrors({ errors }: { errors: string[] }) {
  return errors.length ? (
    <div className="error-box" role="alert">
      <strong>Please check the following:</strong>
      <ul>
        {errors.map((error, index) => (
          <li key={`${index}-${error}`}>{error}</li>
        ))}
      </ul>
    </div>
  ) : null;
}
