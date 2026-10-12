import { Matrix4, Vector3, type BufferGeometry } from "three";
import { prepareStlGeometry } from "./stl-geometry";
import { getStlViewFrame } from "./stl-orientation";

// An uploaded STL in the viewer's hold coordinates: the broad flat face the
// preview cameras treat as the mounting face lies on Z=0 facing down, the
// longer footprint direction runs along X, and the file's own units are
// kept so the board and grid read at true size. The original bytes are
// never changed; only this copy is moved.
export function holdGeometry(data: ArrayBuffer): BufferGeometry {
  const geometry = prepareStlGeometry(data);
  try {
    const frame = getStlViewFrame(geometry);
    const radius = Number(geometry.userData.radius) || 1;
    geometry.applyMatrix4(
      new Matrix4().makeBasis(frame.across, frame.depth, frame.up).transpose(),
    );
    geometry.scale(radius, radius, radius);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const centre = box.getCenter(new Vector3());
    geometry.translate(-centre.x, -centre.y, -box.min.z);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}
