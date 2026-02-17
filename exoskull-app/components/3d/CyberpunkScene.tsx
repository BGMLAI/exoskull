"use client";

import dynamic from "next/dynamic";
import { Suspense, useState, useEffect } from "react";

const CyberpunkSceneInner = dynamic(() => import("./CyberpunkSceneInner"), {
  ssr: false,
  loading: () => (
    <div
      className="fixed inset-0 z-0"
      style={{ background: "hsl(var(--background))" }}
    />
  ),
});

interface CyberpunkSceneProps {
  className?: string;
}

/** Detect WebGL support */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Static fallback for mobile/no-WebGL */
function StaticBackground() {
  return (
    <div
      className="fixed inset-0 z-0"
      role="img"
      aria-label="ExoSkull — tło cyberpunkowe"
      style={{
        background:
          "radial-gradient(ellipse at 50% 120%, hsl(var(--bg-void, 263 60% 11%)) 0%, hsl(var(--background)) 60%, hsl(var(--background)) 100%)",
      }}
    >
      {/* Simple CSS star field */}
      <div
        className="absolute inset-0 opacity-30"
        aria-hidden="true"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.5) 0%, transparent 100%), " +
            "radial-gradient(1px 1px at 40% 70%, rgba(255,255,255,0.3) 0%, transparent 100%), " +
            "radial-gradient(1px 1px at 60% 20%, rgba(255,255,255,0.4) 0%, transparent 100%), " +
            "radial-gradient(1px 1px at 80% 50%, rgba(255,255,255,0.3) 0%, transparent 100%), " +
            "radial-gradient(1px 1px at 10% 80%, rgba(255,255,255,0.5) 0%, transparent 100%)",
        }}
      />
      {/* Horizon glow */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1/3 opacity-20"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(to top, rgba(139,92,246,0.3) 0%, transparent 100%)",
        }}
      />
    </div>
  );
}

/**
 * Dynamic wrapper for the 3D cyberpunk scene.
 * - No SSR (Three.js requires browser APIs)
 * - Fallback: solid dark background while loading
 * - WebGL detection: falls back to static gradient if no WebGL
 * - Mobile: static background on screens < 768px
 * - prefers-reduced-motion: static background
 */
export function CyberpunkScene({ className }: CyberpunkSceneProps) {
  const [canRender3D, setCanRender3D] = useState<boolean | null>(null);

  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const webgl = hasWebGL();

    setCanRender3D(!isMobile && !reducedMotion && webgl);
  }, []);

  // Still checking — show loading background
  if (canRender3D === null) {
    return (
      <div
        className="fixed inset-0 z-0"
        style={{ background: "hsl(var(--background))" }}
      />
    );
  }

  // No 3D — show static fallback
  if (!canRender3D) {
    return <StaticBackground />;
  }

  return (
    <div
      id="3d-scene"
      role="img"
      aria-label="Interaktywna scena 3D ExoSkull — wizualizacja orbitalnych światów i danych"
    >
      {/* Screen reader description */}
      <div className="sr-only">
        Scena 3D przedstawia orbitalne światy reprezentujące różne obszary
        życia: zadania, wspomnienia, cele i integracje. Interakcja odbywa się
        głównie przez panel czatu i przyciski w dolnej części ekranu.
      </div>
      <Suspense
        fallback={
          <div
            className="fixed inset-0 z-0"
            style={{ background: "hsl(var(--background))" }}
          />
        }
      >
        <CyberpunkSceneInner className={className} />
      </Suspense>
    </div>
  );
}
