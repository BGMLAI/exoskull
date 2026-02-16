"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { SynthwaveGrid } from "./SynthwaveGrid";
import { Skybox } from "./Skybox";
import { Particles } from "./Particles";
import { ScenePostProcessing } from "./ScenePostProcessing";
import { SceneEffects } from "./SceneEffects";
import { OrbitalScene } from "./OrbitalScene";
import { useCockpitStore } from "@/lib/stores/useCockpitStore";
import { DEMO_WORLDS } from "@/lib/worlds/demo-worlds";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

/** Default camera target (center of scene) */
const DEFAULT_TARGET = new THREE.Vector3(0, 2, 0);
/** Lerp speed for camera fly-to animation */
const CAMERA_LERP_SPEED = 0.04;

/**
 * Inner 3D scene content — rendered inside R3F Canvas.
 * Separated so the Canvas wrapper can be dynamically imported (no SSR).
 */
function SceneContent() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const selectedWorldId = useCockpitStore((s) => s.selectedWorldId);

  /** Compute the target position for the camera based on selected world */
  const targetPos = useMemo(() => {
    if (!selectedWorldId) return DEFAULT_TARGET;
    const world = DEMO_WORLDS.find((w) => w.id === selectedWorldId);
    if (!world) return DEFAULT_TARGET;
    // Target slightly in front of the world orb (toward camera)
    return new THREE.Vector3(
      world.position[0],
      world.position[1] + 1,
      world.position[2] + 5,
    );
  }, [selectedWorldId]);

  /** Smoothly animate OrbitControls target toward selected world */
  useFrame(() => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;
    const current = controls.target;
    // Lerp toward target
    current.lerp(targetPos, CAMERA_LERP_SPEED);
    controls.update();
  });

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.8} color={0x111122} />

      {/* Camera controls */}
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.05}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={10}
        maxDistance={70}
        target={[0, 2, 0]}
        enablePan={false}
      />

      {/* Environment */}
      <SynthwaveGrid />
      <Skybox />
      <Particles count={150} />

      {/* Orbital world system */}
      <OrbitalScene
        worlds={DEMO_WORLDS}
        onWorldClick={(id) => {
          const store = useCockpitStore.getState();
          // Toggle: click same world = deselect
          store.selectWorld(store.selectedWorldId === id ? null : id);
        }}
      />

      {/* IORS activity effects (bloom pulse, activity ring) */}
      <SceneEffects />

      {/* Post-processing */}
      <ScenePostProcessing />
    </>
  );
}

interface CyberpunkSceneInnerProps {
  className?: string;
}

/**
 * R3F Canvas wrapper for the cyberpunk 3D scene.
 * Must be dynamically imported with ssr: false.
 */
export default function CyberpunkSceneInner({
  className,
}: CyberpunkSceneInnerProps) {
  return (
    <Canvas
      className={className}
      camera={{
        fov: 75,
        near: 0.1,
        far: 200,
        position: [0, 14, 35],
      }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.2,
      }}
      dpr={[1, 1.5]}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "auto",
      }}
      onCreated={({ scene }) => {
        scene.fog = new THREE.Fog(0x050510, 25, 110);
        scene.background = new THREE.Color(0x050510);
      }}
    >
      <SceneContent />
    </Canvas>
  );
}
