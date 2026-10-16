import { BufferGeometry, Float32BufferAttribute } from "three";
import {
  mergeGeometries,
  toCreasedNormals,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";

// The generator's mesh as viewer geometry. Boolean cuts leave uneven
// triangles: equal face weighting prevents shading ridges along small
// fillets, while sharp back/hole edges stay crisp.
export function previewGeometry(
  data: { vertices: number[][]; faces: number[][] },
  separateBack = false,
): BufferGeometry {
  // A sloper can meet its back at a shallow angle. Keep that flat face out
  // of the curved surface's normal averaging, regardless of crease angle.
  const back: number[][] = [];
  const surface = separateBack
    ? data.faces.filter((face) => {
        if (face.every((i) => Math.abs(data.vertices[i][2]) < 1e-5)) {
          back.push(face);
          return false;
        }
        return true;
      })
    : data.faces;
  const indexed = new BufferGeometry();
  indexed.setAttribute(
    "position",
    new Float32BufferAttribute(data.vertices.flat(), 3),
  );
  indexed.setIndex(surface.flat());
  const geometry = toCreasedNormals(indexed, Math.PI / 3);
  indexed.dispose();
  if (!back.length) return geometry;
  const flat = new BufferGeometry();
  flat.setAttribute(
    "position",
    new Float32BufferAttribute(
      back.flatMap((face) => face.flatMap((i) => data.vertices[i])),
      3,
    ),
  );
  flat.computeVertexNormals();
  const merged = mergeGeometries([geometry, flat])!;
  geometry.dispose();
  flat.dispose();
  return merged;
}
