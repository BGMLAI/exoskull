"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

interface HashtagNodeProps {
  label: string;
  position: [number, number, number];
  color?: string;
  isActive?: boolean;
  onClick?: () => void;
}

/**
 * HashtagNode — floating labeled sphere in 3D space.
 * Radially positioned around the orb. Clickable to filter widgets.
 */
export function HashtagNode({
  label,
  position,
  color = "#3b82f6",
  isActive = false,
  onClick,
}: HashtagNodeProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    // Gentle float
    groupRef.current.position.y =
      position[1] + Math.sin(Date.now() * 0.001 + position[0]) * 0.1;
  });

  return (
    <group ref={groupRef} position={position} onClick={onClick}>
      {/* Sphere */}
      <mesh>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isActive ? 0.8 : 0.3}
          transparent
          opacity={isActive ? 0.9 : 0.6}
        />
      </mesh>

      {/* Label */}
      <Text
        position={[0, 0.55, 0]}
        fontSize={0.25}
        color={isActive ? "#ffffff" : "#a1a1aa"}
        anchorX="center"
        anchorY="bottom"
        font="/fonts/Inter-Medium.woff"
      >
        #{label}
      </Text>
    </group>
  );
}
