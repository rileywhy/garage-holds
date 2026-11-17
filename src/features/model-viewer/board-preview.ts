import * as THREE from "three";

export const DEFAULT_BOARD_ANGLE = 40;
export const MAX_BOARD_ANGLE = 70;

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
  if (!Number.isFinite(angle) || angle < 0 || angle > MAX_BOARD_ANGLE)
    throw new Error(`Board angle must be between 0 and ${MAX_BOARD_ANGLE}°.`);
  group.rotation.set(THREE.MathUtils.degToRad(angle), 0, 0);
}

// A photo of a real sheet (public/images/plywood), as a texture: a patched
// cheap sheet by day, a weathered one at night. It arrives after the first
// frame, so the caller redraws when it does; until then, and wherever images
// cannot load, the plain plywood colour stands in.
export function loadPlywood(dark: boolean, onLoad: () => void) {
  const texture = new THREE.TextureLoader().load(
    `/images/plywood/${dark ? "weathered" : "sheet"}.webp`,
    onLoad,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  // The photos are portrait; the faces they cover are square.
  texture.repeat.set(1, 0.72);
  texture.offset.set(0, 0.14);
  texture.anisotropy = 4;
  return texture;
}

export function plywoodMaterial(dark: boolean, map?: THREE.Texture) {
  return new THREE.MeshStandardMaterial({
    color: map ? (dark ? 0xb9b2aa : 0xd9d2c6) : dark ? 0x82654e : 0xb99a76,
    map: map ?? null,
    roughness: 0.92,
  });
}

export type BoardFaces = { front: THREE.Texture; back: THREE.Texture };

// The two faces of a home board: drilled holes on the climbing side, the
// T-nuts hammered in behind. Each shows a 3 × 3 block with one T-nut in the
// middle, where the hold bolts on.
export function loadBoardFaces(onLoad: () => void): BoardFaces {
  const face = (side: string) => {
    const texture = new THREE.TextureLoader().load(
      `/images/plywood/panel-${side}.webp`,
      onLoad,
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  };
  return { front: face("front"), back: face("back") };
}

export class BoardPanel {
  readonly mesh: THREE.Mesh;
  private edges: THREE.LineSegments;

  constructor(dark: boolean, faces?: BoardFaces) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const side = plywoodMaterial(dark);
    // Box faces run +X, -X, +Y, -Y, +Z (the climbing side), -Z (the back).
    this.mesh = new THREE.Mesh(geometry, [
      side,
      side,
      side,
      side,
      plywoodMaterial(dark, faces?.front),
      plywoodMaterial(dark, faces?.back),
    ]);
    this.edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: dark ? 0x443b39 : 0x78634e }),
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
