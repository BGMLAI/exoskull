/**
 * Generate child positions distributed in a circle around a parent.
 */
export interface ChildOrbitConfig {
  position: [number, number, number];
  speed: number;
  phase: number;
}

export function generateChildPositions(
  parentPos: [number, number, number],
  count: number,
  orbitRadius: number,
): ChildOrbitConfig[] {
  if (count === 0) return [];

  const results: ChildOrbitConfig[] = [];
  const angleStep = (Math.PI * 2) / count;

  for (let i = 0; i < count; i++) {
    const angle = angleStep * i;
    // Vary Y height with sin wave for organic feel
    const yOffset = Math.sin(angle * 1.5) * 0.8;
    results.push({
      position: [
        parentPos[0] + Math.cos(angle) * orbitRadius,
        parentPos[1] + yOffset,
        parentPos[2] + Math.sin(angle) * orbitRadius,
      ],
      speed: 0.15 + Math.random() * 0.25,
      phase: angle,
    });
  }

  return results;
}

/**
 * Generate static positions for focused view (children laid out in circle, not orbiting).
 */
export function generateStaticChildPositions(
  centerPos: [number, number, number],
  count: number,
  radius: number,
): [number, number, number][] {
  if (count === 0) return [];

  const results: [number, number, number][] = [];
  const angleStep = (Math.PI * 2) / count;

  for (let i = 0; i < count; i++) {
    const angle = angleStep * i - Math.PI / 2; // start from top
    results.push([
      centerPos[0] + Math.cos(angle) * radius,
      centerPos[1] + Math.sin(angle * 0.5) * 1.0,
      centerPos[2] + Math.sin(angle) * radius,
    ]);
  }

  return results;
}
