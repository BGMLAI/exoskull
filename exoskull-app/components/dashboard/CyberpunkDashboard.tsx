"use client";

import { CyberpunkScene } from "@/components/3d/CyberpunkScene";
import { CockpitHUDShell } from "@/components/cockpit/CockpitHUDShell";
import { ToolExecutionOverlay } from "./ToolExecutionOverlay";
import { FloatingCallButton } from "@/components/voice/FloatingCallButton";
import { OrbContextMenuOverlay } from "@/components/3d/OrbContextMenu";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { useCockpitStore } from "@/lib/stores/useCockpitStore";
import { Map, Orbit } from "lucide-react";

interface CyberpunkDashboardProps {
  tenantId: string;
  iorsName?: string;
}

/**
 * CyberpunkDashboard — 3D + 2D Cockpit HUD layered dashboard.
 *
 * Two view modes:
 *   - classic: Original R3F Canvas + CockpitHUDShell
 *   - mindmap: 3D Mind Map Workspace (WorkspaceLayout)
 *
 * Toggle button in top-right corner switches between views.
 */
export function CyberpunkDashboard({ tenantId }: CyberpunkDashboardProps) {
  const viewMode = useCockpitStore((s) => s.viewMode);
  const toggleViewMode = useCockpitStore((s) => s.toggleViewMode);

  if (viewMode === "mindmap") {
    return (
      <div className="fixed inset-0 overflow-hidden bg-[#050510]">
        <WorkspaceLayout tenantId={tenantId} />

        {/* ── z-50: View mode toggle ── */}
        <button
          onClick={toggleViewMode}
          className="fixed z-50 top-4 right-24 flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-cyan-400 hover:text-white bg-black/40 hover:bg-cyan-900/40 border border-cyan-800/30 hover:border-cyan-600/50 rounded backdrop-blur-sm transition-all duration-200"
          title="Przelacz na widok klasyczny"
        >
          <Orbit className="w-3.5 h-3.5" />
          Classic
        </button>

        {/* ── z-50: Floating voice call button ── */}
        <div className="fixed z-50 bottom-5 right-5">
          <FloatingCallButton tenantId={tenantId} />
        </div>

        {/* ── z-50: Sign out button ── */}
        <form
          action="/api/auth/signout"
          method="post"
          className="fixed z-50 top-4 right-4"
        >
          <button
            type="submit"
            className="px-3 py-1.5 text-xs font-mono text-slate-500 hover:text-white bg-black/40 hover:bg-red-900/40 border border-slate-800 hover:border-red-700/50 rounded backdrop-blur-sm transition-all duration-200"
          >
            Wyloguj
          </button>
        </form>
      </div>
    );
  }

  // Classic view
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#050510]">
      {/* ── z-0: 3D Scene (world orbs, environment — no spatial panels) ── */}
      <CyberpunkScene className="fixed inset-0 z-0" />

      {/* ── z-10: Cockpit HUD overlay (panels + chat + gauges) ── */}
      <CockpitHUDShell />

      {/* ── z-20: Orb context menu overlay (right-click on 3D orbs) ── */}
      <OrbContextMenuOverlay />

      {/* ── z-30: Tool execution indicator ── */}
      <ToolExecutionOverlay />

      {/* ── z-50: View mode toggle ── */}
      <button
        onClick={toggleViewMode}
        className="fixed z-50 top-4 right-24 flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-cyan-400 hover:text-white bg-black/40 hover:bg-cyan-900/40 border border-cyan-800/30 hover:border-cyan-600/50 rounded backdrop-blur-sm transition-all duration-200"
        title="Przelacz na mape mysli"
      >
        <Map className="w-3.5 h-3.5" />
        Mind Map
      </button>

      {/* ── z-50: Floating voice call button ── */}
      <div className="fixed z-50 bottom-5 right-5">
        <FloatingCallButton tenantId={tenantId} />
      </div>

      {/* ── z-50: Sign out button (top-right corner) ── */}
      <form
        action="/api/auth/signout"
        method="post"
        className="fixed z-50 top-4 right-4"
      >
        <button
          type="submit"
          className="px-3 py-1.5 text-xs font-mono text-slate-500 hover:text-white bg-black/40 hover:bg-red-900/40 border border-slate-800 hover:border-red-700/50 rounded backdrop-blur-sm transition-all duration-200"
        >
          Wyloguj
        </button>
      </form>
    </div>
  );
}
