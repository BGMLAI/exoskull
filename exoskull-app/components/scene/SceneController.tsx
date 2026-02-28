"use client";

import { OrbitControls } from "@react-three/drei";

/**
 * SceneController — camera, lights, fog, controls.
 * Constrained orbit: pan disabled, zoom limited, vertical angle limited.
 */
export function SceneController() {
  return (
    <>
      <perspectiveCamera position={[0, 8, 12]} fov={50} />
      <OrbitControls
        enablePan={false}
        minDistance={6}
        maxDistance={24}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.2}
        enableDamping
        dampingFactor={0.05}
      />
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 10, 5]} intensity={0.6} />
      <fog attach="fog" args={["#000000", 20, 60]} />
    </>
  );
}
