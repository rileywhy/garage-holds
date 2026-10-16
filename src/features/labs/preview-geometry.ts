import { BufferGeometry, Float32BufferAttribute } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { smoothPreviewGeometry } from "../model-viewer/smooth-preview-geometry";

// The generator's mesh as viewer geometry. Boolean cuts leave uneven
// triangles: corner-angle weighting prevents shading ridges along small
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
  const geometry = smoothPreviewGeometry(
    {
      positions: new Float32Array(data.vertices.flat()),
      indices: new Uint32Array(surface.flat()),
    },
    Math.PI / 6,
  );
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
