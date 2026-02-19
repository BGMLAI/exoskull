"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  useCockpitStore,
  type CockpitStyle,
} from "@/lib/stores/useCockpitStore";

/**
 * CockpitModel3D — Renders a procedural cockpit frame around the camera.
 *
 * 5 styles, all built from Three.js primitives (no external GLB files):
 *   1. scifi-spaceship — Curved hull panels + holographic visor
 *   2. cyberpunk-terminal — Angular neon frames + data rain strips
 *   3. minimalist-command — Clean glass panels + thin metal edges
 *   4. steampunk-control — Riveted brass arches + pipe details
 *   5. military-hud — Angular armor plating + tactical green accents
 */

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const COCKPIT_Y = 8; // Camera-relative Y offset
const COCKPIT_Z = 10; // Camera-relative Z offset (in front)

// ---------------------------------------------------------------------------
// Style: Sci-Fi Spaceship
// ---------------------------------------------------------------------------

function SciFiSpaceshipCockpit() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    // Subtle breathing animation
    const t = clock.getElapsedTime();
    groupRef.current.children.forEach((child, i) => {
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh)
          .material as THREE.MeshStandardMaterial;
        if (mat.emissiveIntensity !== undefined) {
          mat.emissiveIntensity = 0.3 + Math.sin(t * 0.8 + i * 0.5) * 0.15;
        }
      }
    });
  });

  const panels = useMemo(() => {
    const items: {
      pos: [number, number, number];
      rot: [number, number, number];
      scale: [number, number, number];
    }[] = [
      // Left hull panel
      {
        pos: [-14, COCKPIT_Y + 2, COCKPIT_Z - 5],
        rot: [0, 0.4, 0.15],
        scale: [0.3, 6, 12],
      },
      // Right hull panel
      {
        pos: [14, COCKPIT_Y + 2, COCKPIT_Z - 5],
        rot: [0, -0.4, -0.15],
        scale: [0.3, 6, 12],
      },
      // Top visor bar
      {
        pos: [0, COCKPIT_Y + 8, COCKPIT_Z - 3],
        rot: [0.3, 0, 0],
        scale: [20, 0.3, 4],
      },
      // Bottom console
      {
        pos: [0, COCKPIT_Y - 4, COCKPIT_Z + 2],
        rot: [-0.4, 0, 0],
        scale: [18, 0.4, 6],
      },
      // Left strut
      {
        pos: [-10, COCKPIT_Y + 5, COCKPIT_Z],
        rot: [0, 0.2, 0.6],
        scale: [0.2, 8, 0.2],
      },
      // Right strut
      {
        pos: [10, COCKPIT_Y + 5, COCKPIT_Z],
        rot: [0, -0.2, -0.6],
        scale: [0.2, 8, 0.2],
      },
    ];
    return items;
  }, []);

  return (
    <group ref={groupRef}>
      {panels.map((p, i) => (
        <mesh key={i} position={p.pos} rotation={p.rot}>
          <boxGeometry args={p.scale} />
          <meshStandardMaterial
            color={0x1a1a3e}
            emissive={0x00d4ff}
            emissiveIntensity={0.3}
            metalness={0.9}
            roughness={0.2}
            transparent
            opacity={0.6}
          />
        </mesh>
      ))}
      {/* Holographic visor glow */}
      <mesh position={[0, COCKPIT_Y + 7, COCKPIT_Z - 2]} rotation={[0.2, 0, 0]}>
        <planeGeometry args={[22, 3]} />
        <meshBasicMaterial
          color={0x00d4ff}
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Style: Cyberpunk Terminal
// ---------------------------------------------------------------------------

function CyberpunkTerminalCockpit() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    // Flicker effect on neon strips
    groupRef.current.children.forEach((child, i) => {
      if (i > 3) {
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (mat?.opacity !== undefined) {
          mat.opacity =
            0.4 + Math.random() * 0.3 * (Math.sin(t * 4 + i) > 0 ? 1 : 0.5);
        }
      }
    });
  });

  return (
    <group ref={groupRef}>
      {/* Angular frame - left */}
      <mesh
        position={[-13, COCKPIT_Y + 1, COCKPIT_Z - 4]}
        rotation={[0, 0.3, 0.2]}
      >
        <boxGeometry args={[0.15, 10, 8]} />
        <meshStandardMaterial
          color={0x0f0f2e}
          metalness={0.95}
          roughness={0.1}
        />
      </mesh>
      {/* Angular frame - right */}
      <mesh
        position={[13, COCKPIT_Y + 1, COCKPIT_Z - 4]}
        rotation={[0, -0.3, -0.2]}
      >
        <boxGeometry args={[0.15, 10, 8]} />
        <meshStandardMaterial
          color={0x0f0f2e}
          metalness={0.95}
          roughness={0.1}
        />
      </mesh>
      {/* Top bar */}
      <mesh
        position={[0, COCKPIT_Y + 7, COCKPIT_Z - 2]}
        rotation={[0.25, 0, 0]}
      >
        <boxGeometry args={[24, 0.2, 3]} />
        <meshStandardMaterial
          color={0x0f0f2e}
          metalness={0.95}
          roughness={0.1}
        />
      </mesh>
      {/* Bottom console */}
      <mesh
        position={[0, COCKPIT_Y - 3.5, COCKPIT_Z + 1]}
        rotation={[-0.35, 0, 0]}
      >
        <boxGeometry args={[20, 0.3, 5]} />
        <meshStandardMaterial
          color={0x0f0f2e}
          metalness={0.95}
          roughness={0.1}
        />
      </mesh>
      {/* Neon strips */}
      {[
        [-12, 0.35],
        [-8, 0.25],
        [8, -0.25],
        [12, -0.35],
      ].map(([x, rotZ], i) => (
        <mesh
          key={i}
          position={[x as number, COCKPIT_Y + 1, COCKPIT_Z - 3]}
          rotation={[0, 0, rotZ as number]}
        >
          <boxGeometry args={[0.06, 9, 0.06]} />
          <meshBasicMaterial color={0xff00ff} transparent opacity={0.5} />
        </mesh>
      ))}
      {/* Horizontal neon accent */}
      <mesh position={[0, COCKPIT_Y + 6.5, COCKPIT_Z - 1.5]}>
        <boxGeometry args={[22, 0.04, 0.04]} />
        <meshBasicMaterial color={0x00ffff} transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Style: Minimalist Command
// ---------------------------------------------------------------------------

function MinimalistCommandCockpit() {
  return (
    <group>
      {/* Thin metal frame — left */}
      <mesh
        position={[-12, COCKPIT_Y + 2, COCKPIT_Z - 5]}
        rotation={[0, 0.25, 0.1]}
      >
        <boxGeometry args={[0.08, 8, 10]} />
        <meshStandardMaterial
          color={0xd4d4d8}
          metalness={0.8}
          roughness={0.3}
          transparent
          opacity={0.4}
        />
      </mesh>
      {/* Thin metal frame — right */}
      <mesh
        position={[12, COCKPIT_Y + 2, COCKPIT_Z - 5]}
        rotation={[0, -0.25, -0.1]}
      >
        <boxGeometry args={[0.08, 8, 10]} />
        <meshStandardMaterial
          color={0xd4d4d8}
          metalness={0.8}
          roughness={0.3}
          transparent
          opacity={0.4}
        />
      </mesh>
      {/* Top rail */}
      <mesh
        position={[0, COCKPIT_Y + 6.5, COCKPIT_Z - 3]}
        rotation={[0.15, 0, 0]}
      >
        <boxGeometry args={[22, 0.06, 2]} />
        <meshStandardMaterial
          color={0xfafafa}
          metalness={0.7}
          roughness={0.4}
          transparent
          opacity={0.35}
        />
      </mesh>
      {/* Glass panels (very subtle) */}
      <mesh
        position={[-11, COCKPIT_Y + 2, COCKPIT_Z - 4]}
        rotation={[0, 0.2, 0]}
      >
        <planeGeometry args={[4, 7]} />
        <meshPhysicalMaterial
          color={0xffffff}
          transmission={0.95}
          roughness={0.05}
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh
        position={[11, COCKPIT_Y + 2, COCKPIT_Z - 4]}
        rotation={[0, -0.2, 0]}
      >
        <planeGeometry args={[4, 7]} />
        <meshPhysicalMaterial
          color={0xffffff}
          transmission={0.95}
          roughness={0.05}
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Style: Steampunk Control
// ---------------------------------------------------------------------------

function SteampunkControlCockpit() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    // Rotate gears
    const t = clock.getElapsedTime();
    const gears = groupRef.current.children.filter((_, i) => i >= 4);
    gears.forEach((gear, i) => {
      gear.rotation.z = t * 0.3 * (i % 2 === 0 ? 1 : -1);
    });
  });

  return (
    <group ref={groupRef}>
      {/* Brass arch — left */}
      <mesh
        position={[-13, COCKPIT_Y + 2, COCKPIT_Z - 4]}
        rotation={[0, 0.3, 0.15]}
      >
        <boxGeometry args={[0.4, 7, 10]} />
        <meshStandardMaterial
          color={0xb87333}
          metalness={0.85}
          roughness={0.35}
        />
      </mesh>
      {/* Brass arch — right */}
      <mesh
        position={[13, COCKPIT_Y + 2, COCKPIT_Z - 4]}
        rotation={[0, -0.3, -0.15]}
      >
        <boxGeometry args={[0.4, 7, 10]} />
        <meshStandardMaterial
          color={0xb87333}
          metalness={0.85}
          roughness={0.35}
        />
      </mesh>
      {/* Top riveted bar */}
      <mesh position={[0, COCKPIT_Y + 7, COCKPIT_Z - 2]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[22, 0.5, 2.5]} />
        <meshStandardMaterial
          color={0x8b6914}
          metalness={0.8}
          roughness={0.4}
        />
      </mesh>
      {/* Console with copper pipes */}
      <mesh
        position={[0, COCKPIT_Y - 3, COCKPIT_Z + 1]}
        rotation={[-0.3, 0, 0]}
      >
        <boxGeometry args={[18, 0.6, 4]} />
        <meshStandardMaterial
          color={0x654321}
          metalness={0.6}
          roughness={0.5}
        />
      </mesh>
      {/* Decorative gears */}
      {[
        [-11, COCKPIT_Y + 5.5],
        [11, COCKPIT_Y + 5.5],
        [-11, COCKPIT_Y - 1.5],
        [11, COCKPIT_Y - 1.5],
      ].map(([x, y], i) => (
        <mesh key={i} position={[x as number, y as number, COCKPIT_Z - 6]}>
          <torusGeometry args={[0.8, 0.15, 8, 12]} />
          <meshStandardMaterial
            color={0xcd7f32}
            metalness={0.9}
            roughness={0.3}
          />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Style: Military HUD
// ---------------------------------------------------------------------------

function MilitaryHUDCockpit() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    // Tactical scan line
    const scanLine =
      groupRef.current.children[groupRef.current.children.length - 1];
    if (scanLine) {
      scanLine.position.y = COCKPIT_Y + Math.sin(t * 0.5) * 4;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Armor plate — left */}
      <mesh
        position={[-14, COCKPIT_Y + 1, COCKPIT_Z - 5]}
        rotation={[0, 0.35, 0.12]}
      >
        <boxGeometry args={[0.5, 8, 11]} />
        <meshStandardMaterial
          color={0x2d3a2d}
          metalness={0.7}
          roughness={0.5}
        />
      </mesh>
      {/* Armor plate — right */}
      <mesh
        position={[14, COCKPIT_Y + 1, COCKPIT_Z - 5]}
        rotation={[0, -0.35, -0.12]}
      >
        <boxGeometry args={[0.5, 8, 11]} />
        <meshStandardMaterial
          color={0x2d3a2d}
          metalness={0.7}
          roughness={0.5}
        />
      </mesh>
      {/* Top bar — angular */}
      <mesh
        position={[0, COCKPIT_Y + 7.5, COCKPIT_Z - 3]}
        rotation={[0.25, 0, 0]}
      >
        <boxGeometry args={[24, 0.4, 3]} />
        <meshStandardMaterial
          color={0x1a2e1a}
          metalness={0.75}
          roughness={0.4}
        />
      </mesh>
      {/* Console base */}
      <mesh
        position={[0, COCKPIT_Y - 3.5, COCKPIT_Z + 1.5]}
        rotation={[-0.35, 0, 0]}
      >
        <boxGeometry args={[20, 0.5, 5]} />
        <meshStandardMaterial
          color={0x1a2e1a}
          metalness={0.75}
          roughness={0.4}
        />
      </mesh>
      {/* Green tactical accent lines */}
      {[
        [-12.5, COCKPIT_Y + 5],
        [-12.5, COCKPIT_Y - 1],
        [12.5, COCKPIT_Y + 5],
        [12.5, COCKPIT_Y - 1],
      ].map(([x, y], i) => (
        <mesh key={i} position={[x as number, y as number, COCKPIT_Z - 4.5]}>
          <boxGeometry args={[0.04, 0.04, 8]} />
          <meshBasicMaterial color={0x00ff41} transparent opacity={0.5} />
        </mesh>
      ))}
      {/* Scanning line */}
      <mesh position={[0, COCKPIT_Y, COCKPIT_Z - 3]}>
        <boxGeometry args={[24, 0.02, 0.02]} />
        <meshBasicMaterial color={0x00ff41} transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Main export — selects cockpit based on store
// ---------------------------------------------------------------------------

const COCKPIT_MAP: Record<CockpitStyle, React.FC | null> = {
  none: null,
  "scifi-spaceship": SciFiSpaceshipCockpit,
  "cyberpunk-terminal": CyberpunkTerminalCockpit,
  "minimalist-command": MinimalistCommandCockpit,
  "steampunk-control": SteampunkControlCockpit,
  "military-hud": MilitaryHUDCockpit,
};

export function CockpitModel3D() {
  const cockpitStyle = useCockpitStore((s) => s.cockpitStyle);
  const Component = COCKPIT_MAP[cockpitStyle];
  if (!Component) return null;
  return <Component />;
}
