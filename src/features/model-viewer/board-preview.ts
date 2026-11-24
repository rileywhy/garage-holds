import * as THREE from "three";

export const DEFAULT_BOARD_ANGLE = 40;
export const MAX_BOARD_ANGLE = 70;
export const ROOF_ANGLE = 90;

// The board behind the hold is a fixed panel the size of a Bambu Lab A1
// print bed, 256 × 256 mm, so moving the size sliders changes the hold
// against a constant reference instead of rescaling the board with it. A
// hold wider than the bed overhangs the panel, which is the cue that it
// will not print on an A1 in one piece (RIL-66).
export const BOARD_PANEL_MM = 256;
export const BOARD_THICKNESS_MM = 8;

// Native model axes: X across the board, Y up it, Z out of its face.
// Positive rotation tips the top towards the climber: angle FROM vertical.
export function mountOnBoard(group: THREE.Group, angle: number) {
  if (!Number.isFinite(angle) || angle < 0 || angle > ROOF_ANGLE)
    throw new Error(`Board angle must be between 0 and ${ROOF_ANGLE}°.`);
  group.rotation.set(THREE.MathUtils.degToRad(angle), 0, 0);
}

// The plywood in public/images/plywood, drilled the way a gym drills a wall:
// holes 200 mm apart along a row, rows 100 mm apart and offset by 100 mm
// (docs/plywood-images.md). Each image is a square with a hole in its centre.
// A texture arrives after the first frame, so the caller redraws when it
// does; until then, and wherever images cannot load, the plain plywood
// colour stands in.
export function loadPlywood(
  name: "bench" | "panel-front" | "panel-back",
  onLoad: () => void,
) {
  const texture = new THREE.TextureLoader().load(
    `/images/plywood/${name}.webp`,
    onLoad,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// The wood is lit the same in both themes: only the room behind it changes.
export function plywoodMaterial(map?: THREE.Texture) {
  return new THREE.MeshStandardMaterial({
    color: map ? 0xffffff : 0xc4a57e,
    map: map ?? null,
    roughness: 0.92,
  });
}

export type BoardFaces = { front: THREE.Texture; back: THREE.Texture };

// The two faces of the board: drilled holes on the climbing side, the T-nuts
// hammered in behind. The hold bolts on at the hole in the middle.
export function loadBoardFaces(onLoad: () => void): BoardFaces {
  return {
    front: loadPlywood("panel-front", onLoad),
    back: loadPlywood("panel-back", onLoad),
  };
}

export class BoardPanel {
  readonly mesh: THREE.Mesh;
  private edges: THREE.LineSegments;

  constructor(faces?: BoardFaces) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const side = plywoodMaterial();
    // Box faces run +X, -X, +Y, -Y, +Z (the climbing side), -Z (the back).
    this.mesh = new THREE.Mesh(geometry, [
      side,
      side,
      side,
      side,
      plywoodMaterial(faces?.front),
      plywoodMaterial(faces?.back),
    ]);
    this.edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x78634e }),
    );
    this.mesh.add(this.edges);
    this.mesh.visible = false;
  }

  // Centres the fixed panel behind the hold; its size never changes.
  placeBehind(bounds: THREE.Box3) {
    const centre = bounds.getCenter(new THREE.Vector3());
    this.mesh.scale.set(BOARD_PANEL_MM, BOARD_PANEL_MM, BOARD_THICKNESS_MM);
    this.mesh.position.set(centre.x, centre.y, -BOARD_THICKNESS_MM / 2);
  }

  dispose() {
    this.mesh.geometry.dispose();
    for (const material of new Set(
      this.mesh.material as THREE.MeshStandardMaterial[],
    )) {
      material.map?.dispose();
      material.dispose();
    }
    this.edges.geometry.dispose();
    (this.edges.material as THREE.Material).dispose();
  }
}
