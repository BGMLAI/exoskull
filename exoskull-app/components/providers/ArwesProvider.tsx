"use client";

import { type ReactNode } from "react";

/**
 * ArwesProvider — Sci-fi UI theme wrapper.
 *
 * Wraps children with Arwes animation/theme context.
 * Uses ExoSkull brand colors: cyan #00d4ff, violet #8b5cf6.
 *
 * Note: Arwes v1 packages may not have stable React 18 providers.
 * This acts as a future-proof wrapper — currently applies CSS variables
 * and will integrate Arwes AnimatorGeneralProvider when stable.
 */
interface ArwesProviderProps {
  children: ReactNode;
}

export function ArwesProvider({ children }: ArwesProviderProps) {
  return (
    <div
      className="arwes-root"
      style={
        {
          "--arwes-cyan": "#00d4ff",
          "--arwes-violet": "#8b5cf6",
          "--arwes-dark": "#050510",
          "--arwes-glow": "0 0 12px rgba(0, 212, 255, 0.3)",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
