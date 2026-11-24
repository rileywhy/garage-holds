import { LatheGeometry, Vector2 } from "three";

export function exampleHold() {
  const profile = [new Vector2(0, 0)];
  for (let i = 0; i <= 36; i++) {
    const angle = ((i / 36) * Math.PI) / 2;
    profile.push(
      new Vector2(i === 36 ? 0 : 48 * Math.cos(angle), 26 * Math.sin(angle)),
    );
  }
  return new LatheGeometry(profile, 144)
    .rotateX(Math.PI / 2)
    .scale(1.15, 0.78, 1);
}
