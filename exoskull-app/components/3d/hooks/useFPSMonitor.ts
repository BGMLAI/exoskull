"use client";

import { useRef, useCallback } from "react";
import { useFrame } from "@react-three/fiber";

/**
 * Monitors FPS and provides a quality level signal.
 * quality: "high" (>40fps), "medium" (20-40fps), "low" (<20fps)
 */
export function useFPSMonitor() {
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const fpsRef = useRef(60);
  const qualityRef = useRef<"high" | "medium" | "low">("high");

  useFrame(() => {
    frameCount.current++;
    const now = performance.now();
    const elapsed = now - lastTime.current;

    if (elapsed >= 1000) {
      fpsRef.current = (frameCount.current / elapsed) * 1000;
      frameCount.current = 0;
      lastTime.current = now;

      if (fpsRef.current < 20) {
        qualityRef.current = "low";
      } else if (fpsRef.current < 40) {
        qualityRef.current = "medium";
      } else {
        qualityRef.current = "high";
      }
    }
  });

  const getFPS = useCallback(() => fpsRef.current, []);
  const getQuality = useCallback(() => qualityRef.current, []);

  return { getFPS, getQuality };
}
