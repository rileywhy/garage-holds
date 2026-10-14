import type { Parameters } from "./api";
export function mountingControlVisible(key: string, parameters: Parameters) {
  if (key.startsWith("bolt_") && key !== "bolt_mount")
    return Boolean(parameters.bolt_mount);
  if (parameters.bolt_mount && ["screw_count", "screw_spacing"].includes(key))
    return false;
  return true;
}
