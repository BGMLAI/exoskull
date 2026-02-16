"use client";

import { useRef, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

export interface WorldOrbData {
  id: string;
  name: string;
  color: string; // hex like "#10b981"
  position: [number, number, number];
  radius: number;
  moons?: {
    id: string;
    name: string;
    orbitRadius: number;
    speed: number;
    phase: number;
  }[];
}

interface WorldOrbProps {
  world: WorldOrbData;
  phaseOffset: number;
  onClick?: (worldId: string) => void;
}

/**
 * Single world orb: glowing sphere + halo + point light + orbit ring + orbiting moons.
 * Floats gently up/down, rotates slowly.
 */
export function WorldOrb({ world, phaseOffset, onClick }: WorldOrbProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const moonRefs = useRef<THREE.Mesh[]>([]);
  const [hovered, setHovered] = useState(false);
  const colorNum = useMemo(
    () => new THREE.Color(world.color).getHex(),
    [world.color],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (meshRef.current) {
      meshRef.current.position.y =
        world.position[1] + Math.sin(t * 0.6 + phaseOffset) * 0.5;
      meshRef.current.rotation.y = t * 0.15 + phaseOffset;
    }
  });

  return (
    <group>
      {/* Core orb */}
      <mesh
        ref={meshRef}
        position={world.position}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(world.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[world.radius, 32, 32]} />
        <meshStandardMaterial
          color={colorNum}
          emissive={colorNum}
          emissiveIntensity={hovered ? 1.0 : 0.6}
          metalness={0.3}
          roughness={0.4}
        />

        {/* Glow halo */}
        <mesh>
          <sphereGeometry
            args={[world.radius * (hovered ? 1.5 : 1.35), 16, 16]}
          />
          <meshBasicMaterial
            color={colorNum}
            transparent
            opacity={hovered ? 0.18 : 0.08}
            side={THREE.BackSide}
          />
        </mesh>

        {/* Point light */}
        <pointLight
          color={colorNum}
          intensity={hovered ? 1.2 : 0.6}
          distance={15}
        />

        {/* Floating label */}
        <Html
          position={[0, world.radius + 1.0, 0]}
          center
          distanceFactor={20}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              color: "white",
              fontSize: "13px",
              fontWeight: 600,
              textShadow: `0 0 12px ${world.color}, 0 0 4px rgba(0,0,0,0.8)`,
              whiteSpace: "nowrap",
              opacity: hovered ? 1 : 0.6,
              transition: "opacity 0.2s",
            }}
          >
            {world.name}
          </div>
        </Html>

        {/* Orbit ring */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry
            args={[world.radius * 2.5, world.radius * 2.5 + 0.04, 64]}
          />
          <meshBasicMaterial
            color={colorNum}
            transparent
            opacity={0.15}
            side={THREE.DoubleSide}
          />
        </mesh>
      </mesh>

      {/* Moons */}
      {world.moons?.map((moon, i) => (
        <MoonMesh
          key={moon.id}
          parentPosition={world.position}
          parentColor={world.color}
          orbitRadius={moon.orbitRadius}
          speed={moon.speed}
          phase={moon.phase}
          phaseOffset={phaseOffset}
          ref={(el) => {
            if (el) moonRefs.current[i] = el;
          }}
        />
      ))}
    </group>
  );
}

import { forwardRef } from "react";

interface MoonMeshProps {
  parentPosition: [number, number, number];
  parentColor: string;
  orbitRadius: number;
  speed: number;
  phase: number;
  phaseOffset: number;
}

const MoonMesh = forwardRef<THREE.Mesh, MoonMeshProps>(function MoonMesh(
  { parentPosition, parentColor, orbitRadius, speed, phase, phaseOffset },
  ref,
) {
  const innerRef = useRef<THREE.Mesh>(null);
  const moonColor = useMemo(() => {
    return new THREE.Color(parentColor).lerp(new THREE.Color(0xffffff), 0.4);
  }, [parentColor]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const mesh = innerRef.current;
    if (!mesh) return;
    const angle = t * speed + phase;
    const parentY = parentPosition[1] + Math.sin(t * 0.6 + phaseOffset) * 0.5;
    mesh.position.set(
      parentPosition[0] + Math.cos(angle) * orbitRadius,
      parentY + Math.sin(angle * 0.3) * 0.3,
      parentPosition[2] + Math.sin(angle) * orbitRadius,
    );
  });

  return (
    <mesh ref={innerRef}>
      <sphereGeometry args={[0.25, 16, 16]} />
      <meshStandardMaterial
        color={moonColor}
        emissive={moonColor}
        emissiveIntensity={0.5}
      />
    </mesh>
  );
});
