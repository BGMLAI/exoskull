"use client";

import { CyberpunkScene } from "@/components/3d/CyberpunkScene";
import { CockpitHUDShell } from "@/components/cockpit/CockpitHUDShell";
import { ToolExecutionOverlay } from "./ToolExecutionOverlay";
import { FloatingCallButton } from "@/components/voice/FloatingCallButton";

interface CyberpunkDashboardProps {
  tenantId: string;
  iorsName?: string;
}

/**
 * CyberpunkDashboard — 3D + 2D Cockpit HUD layered dashboard.
 *
 * Layers (z-index):
 *   z-0   → R3F Canvas (3D scene: orbs, grid, skybox, particles, post-processing)
 *   z-10  → CockpitHUDShell (2D HTML/CSS cockpit overlay with panels + chat)
 *   z-30  → Tool execution indicator
 *   z-50  → Voice call button (always accessible)
 */
export function CyberpunkDashboard({ tenantId }: CyberpunkDashboardProps) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#050510]">
      {/* ── z-0: 3D Scene (world orbs, environment — no spatial panels) ── */}
      <CyberpunkScene className="fixed inset-0 z-0" />

      {/* ── z-10: Cockpit HUD overlay (panels + chat + gauges) ── */}
      <CockpitHUDShell />

      {/* ── z-30: Tool execution indicator ── */}
      <ToolExecutionOverlay />

      {/* ── z-50: Floating voice call button ── */}
      <div className="fixed z-50 bottom-5 right-5">
        <FloatingCallButton tenantId={tenantId} />
      </div>
    </div>
  );
}
