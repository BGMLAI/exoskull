"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useSceneStore, type SceneEffect } from "@/lib/stores/useSceneStore";
import * as THREE from "three";

const EFFECT_COLORS: Record<SceneEffect, THREE.Color> = {
  idle: new THREE.Color(0x00d4ff), // cyan (default)
  thinking: new THREE.Color(0x8b5cf6), // violet
  building: new THREE.Color(0xf59e0b), // amber
  searching: new THREE.Color(0x06b6d4), // bright cyan
  executing: new THREE.Color(0x10b981), // emerald
};

/**
 * R3F component that creates visual effects in response to IORS activity.
 * Reads from useSceneStore and renders a pulsing point light + ring.
 */
export function SceneEffects() {
  const lightRef = useRef<THREE.PointLight>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const { effect, bloomPulse } = useSceneStore.getState();
    const targetColor = EFFECT_COLORS[effect];

    if (lightRef.current) {
      // Lerp color toward target
      lightRef.current.color.lerp(targetColor, 0.05);

      // Pulse intensity based on bloomPulse
      const targetIntensity = effect === "idle" ? 0 : bloomPulse * 2;
      lightRef.current.intensity +=
        (targetIntensity - lightRef.current.intensity) * 0.08;
    }

    if (ringRef.current) {
      // Pulse ring opacity
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      const targetOpacity = effect === "idle" ? 0 : 0.15;
      mat.opacity += (targetOpacity - mat.opacity) * 0.06;
      mat.color.lerp(targetColor, 0.05);

      // Slow rotation
      ringRef.current.rotation.z += 0.003;
    }

    // Decay bloomPulse back to 1.0
    if (bloomPulse > 1.0) {
      useSceneStore.setState({
        bloomPulse: Math.max(1.0, bloomPulse - 0.01),
      });
    }
  });

  return (
    <group position={[0, 3, 0]}>
      {/* Central effect light */}
      <pointLight
        ref={lightRef}
        intensity={0}
        distance={30}
        decay={2}
        color={0x00d4ff}
      />

      {/* Activity ring (visible during tool execution) */}
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.5, 4.0, 64]} />
        <meshBasicMaterial
          color={0x00d4ff}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
