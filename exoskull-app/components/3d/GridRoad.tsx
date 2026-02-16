"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface GridRoadProps {
  tileCount?: number;
  color?: number;
}

/**
 * Grid road: tiles that materialize one by one, building a path.
 * Visual metaphor for progress toward goals.
 */
export function GridRoad({ tileCount = 16, color = 0x00d4ff }: GridRoadProps) {
  const tilesRef = useRef<THREE.Mesh[]>([]);
  const startTime = useRef<number | null>(null);

  const tileConfigs = useMemo(
    () =>
      Array.from({ length: tileCount }, (_, i) => ({
        position: [0, 0.05, 25 - i * 2.5] as [number, number, number],
        targetTime: i * 0.3,
      })),
    [tileCount],
  );

  useFrame(({ clock }) => {
    if (startTime.current === null) startTime.current = clock.elapsedTime;
    const elapsed = clock.elapsedTime - startTime.current;

    tilesRef.current.forEach((tile, i) => {
      if (!tile) return;
      const config = tileConfigs[i];
      if (elapsed > config.targetTime) {
        const progress = Math.min(1, (elapsed - config.targetTime) * 2);
        tile.scale.set(progress, progress, progress);
        (tile.material as THREE.MeshBasicMaterial).opacity = progress * 0.15;
      }
    });
  });

  return (
    <group>
      {tileConfigs.map((config, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) tilesRef.current[i] = el;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
          position={config.position}
          scale={[0, 0, 0]}
        >
          <planeGeometry args={[1.8, 1.8]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
