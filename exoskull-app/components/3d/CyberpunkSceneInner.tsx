"use client";

import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { SynthwaveGrid } from "./SynthwaveGrid";
import { Skybox } from "./Skybox";
import { Particles } from "./Particles";
import { ScenePostProcessing } from "./ScenePostProcessing";
import { SceneEffects } from "./SceneEffects";
import { OrbitalScene } from "./OrbitalScene";
import { useCockpitStore } from "@/lib/stores/useCockpitStore";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

/** Default camera target (center of scene) */
const DEFAULT_TARGET = new THREE.Vector3(0, 2, 0);
/** Lerp speed for camera target */
const TARGET_LERP = 0.04;
/** Lerp speed for camera distance */
const DISTANCE_LERP = 0.03;

/**
 * ESC key handler — hooks into global keydown.
 * Navigates back one level, or closes preview first.
 */
function useEscNavigation() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const store = useCockpitStore.getState();
      // Close preview first if open
      if (store.centerMode === "preview") {
        store.closePreview();
        return;
      }
      // Then navigate back
      if (store.navStack.length > 0) {
        store.navigateBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}

/**
 * Camera controller — adjusts target and distance based on navStack depth.
 */
function CameraController({
  controlsRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const navStack = useCockpitStore((s) => s.navStack);
  const depth = navStack.length;

  /** Target position based on depth */
  const desiredTarget = useMemo(() => {
    if (depth === 0) return DEFAULT_TARGET.clone();
    // For deeper levels, target is always scene center (orbs re-center themselves)
    return new THREE.Vector3(0, 2, 0);
  }, [depth]);

  /** Camera distance & limits based on depth */
  const cameraConfig = useMemo(() => {
    if (depth === 0) {
      return { distance: 35, minDist: 10, maxDist: 70, fov: 75 };
    }
    // Zoomed in: closer camera
    return { distance: 18, minDist: 4, maxDist: 30, fov: 65 };
  }, [depth]);

  useFrame(() => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;

    // Lerp target
    controls.target.lerp(desiredTarget, TARGET_LERP);

    // Lerp distance
    const currentDist = camera.position.distanceTo(controls.target);
    if (Math.abs(currentDist - cameraConfig.distance) > 0.5) {
      const dir = camera.position.clone().sub(controls.target).normalize();
      const newDist = THREE.MathUtils.lerp(
        currentDist,
        cameraConfig.distance,
        DISTANCE_LERP,
      );
      camera.position.copy(controls.target).addScaledVector(dir, newDist);
    }

    // Update distance limits
    controls.minDistance = cameraConfig.minDist;
    controls.maxDistance = cameraConfig.maxDist;
    controls.update();
  });

  return null;
}

/**
 * Inner 3D scene content — rendered inside R3F Canvas.
 * Separated so the Canvas wrapper can be dynamically imported (no SSR).
 */
function SceneContent() {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useEscNavigation();

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={1.2} color={0x1a1a30} />

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

      {/* Camera animation controller */}
      <CameraController controlsRef={controlsRef} />

      {/* Environment */}
      <SynthwaveGrid />
      <Skybox />
      <Particles count={150} />

      {/* Orbital world system */}
      <OrbitalScene
        onPointerMissed={() => {
          const store = useCockpitStore.getState();
          if (store.navStack.length > 0) {
            store.navigateBack();
          }
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
        toneMappingExposure: 1.5,
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
        scene.fog = new THREE.Fog(0x0a0a1c, 25, 110);
        scene.background = new THREE.Color(0x0a0a1c);
      }}
    >
      <SceneContent />
    </Canvas>
  );
}
