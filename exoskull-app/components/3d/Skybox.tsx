"use client";

import { useMemo } from "react";
import * as THREE from "three";

/**
 * Stars + nebulae skybox.
 * Creates a hemisphere of stars and semi-transparent nebula spheres.
 */
export function Skybox() {
  const starPositions = useMemo(() => {
    const count = 2500;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 80 + Math.random() * 60;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 5;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    return positions;
  }, []);

  const nebulae = useMemo(
    () => [
      { pos: [-35, 30, -55] as const, color: 0xa855f7, scale: 25 },
      { pos: [40, 25, -60] as const, color: 0x06b6d4, scale: 20 },
      { pos: [0, 40, -80] as const, color: 0xec4899, scale: 30 },
    ],
    [],
  );

  return (
    <group>
      {/* Stars */}
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2500}
            array={starPositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          color={0xffffff}
          size={0.4}
          sizeAttenuation
          transparent
          opacity={0.7}
        />
      </points>

      {/* Nebulae */}
      {nebulae.map((n, i) => (
        <mesh key={i} position={[n.pos[0], n.pos[1], n.pos[2]]}>
          <sphereGeometry args={[n.scale, 16, 16]} />
          <meshBasicMaterial
            color={n.color}
            transparent
            opacity={0.04}
            side={THREE.BackSide}
          />
        </mesh>
      ))}

      {/* Synthwave sun at horizon */}
      <group position={[0, 6, -90]}>
        {/* Sun core */}
        <mesh>
          <circleGeometry args={[8, 64]} />
          <meshBasicMaterial
            color={0xec4899}
            transparent
            opacity={0.35}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Sun outer halo */}
        <mesh position={[0, 0, -0.1]}>
          <circleGeometry args={[12, 64]} />
          <meshBasicMaterial
            color={0xf59e0b}
            transparent
            opacity={0.08}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Scan lines through bottom half of sun */}
        {Array.from({ length: 5 }).map((_, i) => {
          const y = -0.5 - i * 0.8;
          return (
            <mesh key={i} position={[0, y, 0.01]}>
              <planeGeometry args={[20, 0.15]} />
              <meshBasicMaterial
                color={0x050510}
                transparent
                opacity={0.7}
                side={THREE.DoubleSide}
              />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}
