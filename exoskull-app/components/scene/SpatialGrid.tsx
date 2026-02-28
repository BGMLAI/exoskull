"use client";

import { Grid } from "@react-three/drei";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { IorsState } from "@/lib/hooks/useChatEngine";
import * as THREE from "three";

interface SpatialGridProps {
  iorsState: IorsState;
}

const STATE_COLORS: Record<IorsState, string> = {
  idle: "#3b82f6",
  thinking: "#8b5cf6",
  speaking: "#10b981",
  building: "#f59e0b",
  listening: "#06b6d4",
};

/**
 * SpatialGrid — infinite grid floor, color syncs with IORS state.
 */
export function SpatialGrid({ iorsState }: SpatialGridProps) {
  const ref = useRef<THREE.Mesh>(null);

  return (
    <Grid
      ref={ref as any}
      args={[100, 100]}
      position={[0, -0.01, 0]}
      cellSize={1}
      cellThickness={0.5}
      cellColor={STATE_COLORS[iorsState]}
      sectionSize={5}
      sectionThickness={1}
      sectionColor={STATE_COLORS[iorsState]}
      fadeDistance={40}
      fadeStrength={1.5}
      infiniteGrid
    />
  );
}
