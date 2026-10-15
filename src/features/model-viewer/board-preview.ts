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

export class BoardPanel {
  readonly mesh: THREE.Mesh;
  private edges: THREE.LineSegments;

  constructor(dark: boolean) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: dark ? 0x82654e : 0xb99a76,
        roughness: 0.95,
      }),
    );
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
    (this.mesh.material as THREE.Material).dispose();
    this.edges.geometry.dispose();
    (this.edges.material as THREE.Material).dispose();
  }
}
