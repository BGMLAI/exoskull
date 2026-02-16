"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import {
  EffectComposer,
  Bloom,
  Vignette,
  ChromaticAberration,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";

/**
 * Post-processing effects: Bloom (neon glow), Vignette, ChromaticAberration.
 * Bloom strength pulses subtly over time.
 * Auto-disables expensive effects (ChromaticAberration) when FPS drops below 25.
 */
export function ScenePostProcessing() {
  const bloomRef = useRef<any>(null);
  const [lowFPS, setLowFPS] = useState(false);

  // FPS monitoring (inline — avoids extra hook overhead)
  const frameCount = useRef(0);
  const lastFPSCheck = useRef(performance.now());

  useFrame(({ clock }) => {
    // Bloom pulse
    if (bloomRef.current) {
      bloomRef.current.intensity =
        1.4 + Math.sin(clock.elapsedTime * 0.5) * 0.15;
    }

    // FPS check every 2 seconds
    frameCount.current++;
    const now = performance.now();
    if (now - lastFPSCheck.current >= 2000) {
      const fps = (frameCount.current / (now - lastFPSCheck.current)) * 1000;
      frameCount.current = 0;
      lastFPSCheck.current = now;

      if (fps < 25 && !lowFPS) setLowFPS(true);
      else if (fps > 35 && lowFPS) setLowFPS(false);
    }
  });

  return (
    <EffectComposer>
      <Bloom
        ref={bloomRef}
        intensity={1.4}
        luminanceThreshold={0.15}
        luminanceSmoothing={0.5}
        mipmapBlur
      />
      <Vignette
        offset={0.3}
        darkness={0.7}
        blendFunction={BlendFunction.NORMAL}
      />
      <ChromaticAberration
        offset={
          lowFPS ? new THREE.Vector2(0, 0) : new THREE.Vector2(0.0005, 0.0005)
        }
        blendFunction={BlendFunction.NORMAL}
        radialModulation={false}
        modulationOffset={0}
      />
    </EffectComposer>
  );
}
