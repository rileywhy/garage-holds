import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { MAX_STL_PREVIEW_BYTES, MAX_STL_PREVIEW_TRIANGLES } from "./stl-limits";

export function prepareStlGeometry(data: ArrayBuffer) {
  if (data.byteLength > MAX_STL_PREVIEW_BYTES)
    throw new Error("This STL is too large for a browsing preview.");
  const geometry = new STLLoader().parse(data);
  try {
    const positions = geometry.getAttribute("position");
    if (!positions || positions.count < 3 || positions.count % 3 !== 0)
      throw new Error("This STL has no usable triangles.");
    if (positions.count / 3 > MAX_STL_PREVIEW_TRIANGLES)
      throw new Error("This STL is too detailed for a browsing preview.");
    if (!positions.array.every(Number.isFinite))
      throw new Error("This STL contains invalid coordinates.");
    geometry.center();
    geometry.computeBoundingSphere();
    const radius = geometry.boundingSphere?.radius ?? 0;
    if (!Number.isFinite(radius) || radius <= 0)
      throw new Error("This STL has no visible shape.");
    geometry.scale(1 / radius, 1 / radius, 1 / radius);
    // The file's own scale, so a viewer can show the hold at true size again.
    geometry.userData.radius = radius;
    geometry.computeVertexNormals();
    return geometry;
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}
