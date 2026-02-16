"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";

interface EphemeralThreadProps {
  from: [number, number, number];
  to: [number, number, number];
  color?: string;
  phaseOffset?: number;
}

/**
 * Ephemeral connection thread between two world orbs.
 * Oscillates in opacity — appears and fades as a subtle relation indicator.
 */
export function EphemeralThread({
  from,
  to,
  color = "#00d4ff",
  phaseOffset = 0,
}: EphemeralThreadProps) {
  const lineRef = useRef<any>(null);

  useFrame(({ clock }) => {
    if (!lineRef.current) return;
    const t = clock.elapsedTime;
    const opacity = Math.max(0, Math.sin(t * 0.3 + phaseOffset) * 0.12);
    if (lineRef.current.material) {
      lineRef.current.material.opacity = opacity;
    }
  });

  return (
    <Line
      ref={lineRef}
      points={[from, to]}
      color={color}
      lineWidth={1}
      transparent
      opacity={0}
    />
  );
}
