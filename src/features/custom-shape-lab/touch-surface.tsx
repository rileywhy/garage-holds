import { useState, type ReactNode } from "react";
import styles from "./custom-shape-lab.module.css";

export function TouchSurface({
  action,
  children,
}: {
  action: string;
  children: ReactNode;
}) {
  const [active, setActive] = useState(false);
  return (
    <div className={styles.touchSurface} data-active={active}>
      <button
        type="button"
        className={`button button-outline ${styles.touchMode}`}
        aria-pressed={active}
        onClick={() => setActive(!active)}
      >
        {active ? "Done interacting" : action}
      </button>
      {children}
    </div>
  );
}
