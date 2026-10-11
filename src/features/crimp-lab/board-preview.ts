import * as THREE from "three";

export const DEFAULT_BOARD_ANGLE = 40;
export const MAX_BOARD_ANGLE = 70;

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

  fitToHold(bounds: THREE.Box3) {
    const size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3());
    // A local section of board keeps the edge large enough to inspect.
    this.mesh.scale.set(
      Math.max(160, size.x * 1.6),
      Math.max(140, size.y * 2.8),
      8,
    );
    this.mesh.position.set(centre.x, centre.y, -4);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.edges.geometry.dispose();
    (this.edges.material as THREE.Material).dispose();
  }
}
