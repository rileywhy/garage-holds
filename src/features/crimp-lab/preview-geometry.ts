import { BufferGeometry, Float32BufferAttribute } from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Preview } from "./api";

// The generator's mesh as viewer geometry. Boolean cuts leave uneven
// triangles: equal face weighting prevents shading ridges along small
// fillets, while sharp back/hole edges stay crisp.
export function previewGeometry(data: Preview): BufferGeometry {
  const indexed = new BufferGeometry();
  indexed.setAttribute(
    "position",
    new Float32BufferAttribute(data.vertices.flat(), 3),
  );
  indexed.setIndex(data.faces.flat());
  const geometry = toCreasedNormals(indexed, Math.PI / 3);
  indexed.dispose();
  return geometry;
}
