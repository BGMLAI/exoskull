"use client";

import { useEffect, useState } from "react";
import { OrbitControls } from "@react-three/drei";

/**
 * SceneController — camera, lights, fog, controls.
 * Constrained orbit: pan disabled, zoom limited, vertical angle limited.
 */
export function SceneController() {
  // Detect theme for fog color
  const [fogColor, setFogColor] = useState("#000000");

  useEffect(() => {
    function updateFog() {
      if (typeof document === "undefined") return;
      const html = document.documentElement;
      if (html.classList.contains("cyberpunk")) {
        setFogColor("#0a0e1a");
      } else if (
        html.classList.contains("gemini-hybrid") ||
        html.classList.contains("xo-minimal")
      ) {
        setFogColor("#0f1218");
      } else {
        setFogColor("#000000");
      }
    }
    updateFog();
    // Watch for theme changes
    const observer = new MutationObserver(updateFog);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

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
      <fog attach="fog" args={[fogColor, 20, 60]} />
    </>
  );
}
