"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Synthwave-style animated grid floor.
 * Dual-layer: cyan major grid + purple minor grid, scrolling toward camera.
 */
export function SynthwaveGrid() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.position.z = (clock.getElapsedTime() * 0.8) % 5;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Major grid (cyan) */}
      <gridHelper
        args={[200, 40, 0x00d4ff, 0x00d4ff]}
        material-opacity={0.12}
        material-transparent={true}
      />
      {/* Minor grid (purple) */}
      <gridHelper
        args={[200, 200, 0x8b5cf6, 0x8b5cf6]}
        material-opacity={0.04}
        material-transparent={true}
      />
      {/* Horizon glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -60]}>
        <planeGeometry args={[300, 60]} />
        <meshBasicMaterial
          color={0xa855f7}
          transparent
          opacity={0.06}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
