"use client";

import { Html } from "@react-three/drei";
import type { ReactNode } from "react";

interface WidgetCard3DProps {
  position: [number, number, number];
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

/**
 * WidgetCard3D — renders 2D React content floating in 3D space.
 * Uses drei Html transform for glass-morphism cards.
 */
export function WidgetCard3D({
  position,
  children,
  onClick,
  className = "",
}: WidgetCard3DProps) {
  return (
    <group position={position}>
      <Html
        transform
        occlude
        distanceFactor={8}
        className={`pointer-events-auto ${className}`}
      >
        <div
          onClick={onClick}
          className="w-64 p-4 rounded-xl border border-white/10 bg-background/60 backdrop-blur-xl shadow-lg cursor-pointer hover:border-white/20 transition-colors"
        >
          {children}
        </div>
      </Html>
    </group>
  );
}
