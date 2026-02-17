"use client";

import { CyberpunkScene } from "@/components/3d/CyberpunkScene";
import { CockpitHUDShell } from "@/components/cockpit/CockpitHUDShell";
import { ToolExecutionOverlay } from "./ToolExecutionOverlay";
import { CodeSidebar } from "./CodeSidebar";
import { FloatingCallButton } from "@/components/voice/FloatingCallButton";
import { OrbContextMenuOverlay } from "@/components/3d/OrbContextMenu";
import { MindmapLayout } from "@/components/layout/MindmapLayout";
import { LayoutModeSwitch } from "@/components/layout/LayoutModeSwitch";
import { useCockpitStore } from "@/lib/stores/useCockpitStore";
import { ThemeSwitcher } from "@/components/ui/ThemeSwitcher";

interface CyberpunkDashboardProps {
  tenantId: string;
  iorsName?: string;
}

/**
 * CyberpunkDashboard — 3D + 2D Cockpit HUD layered dashboard.
 *
 * Two view modes:
 *   - classic: Original R3F Canvas + CockpitHUDShell
 *   - mindmap: Full-viewport MindMap3D with floating panels (MindmapLayout)
 *
 * Controls bar (top-right) contains LayoutModeSwitch + ThemeSwitcher + Sign out.
 */
export function CyberpunkDashboard({ tenantId }: CyberpunkDashboardProps) {
  const viewMode = useCockpitStore((s) => s.viewMode);

  if (viewMode === "mindmap") {
    return (
      <div className="fixed inset-0 overflow-hidden bg-background">
        <MindmapLayout tenantId={tenantId} />

        {/* ── z-30: Code sidebar (file browser + code viewer) ── */}
        <CodeSidebar />

        {/* ── z-50: Controls bar (top-right) ── */}
        <div className="fixed z-50 top-4 right-4 flex items-center gap-2">
          <LayoutModeSwitch />
          <ThemeSwitcher />
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground bg-card/80 hover:bg-accent border border-border rounded backdrop-blur-sm transition-all duration-200"
            >
              Wyloguj
            </button>
          </form>
        </div>

        {/* ── z-50: Floating voice call button ── */}
        <div className="fixed z-50 bottom-20 right-5">
          <FloatingCallButton tenantId={tenantId} />
        </div>
      </div>
    );
  }

  // Classic view
  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      {/* ── z-0: 3D Scene (world orbs, environment — no spatial panels) ── */}
      <CyberpunkScene className="fixed inset-0 z-0" />

      {/* ── z-10: Cockpit HUD overlay (panels + chat + gauges) ── */}
      <CockpitHUDShell />

      {/* ── z-20: Orb context menu overlay (right-click on 3D orbs) ── */}
      <OrbContextMenuOverlay />

      {/* ── z-30: Tool execution indicator ── */}
      <ToolExecutionOverlay />

      {/* ── z-30: Code sidebar (file browser + code viewer) ── */}
      <CodeSidebar />

      {/* ── z-50: Controls bar (top-right) ── */}
      <div className="fixed z-50 top-4 right-4 flex items-center gap-2">
        <LayoutModeSwitch />
        <ThemeSwitcher />
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground bg-card/80 hover:bg-accent border border-border rounded backdrop-blur-sm transition-all duration-200"
          >
            Wyloguj
          </button>
        </form>
      </div>

      {/* ── z-50: Floating voice call button ── */}
      <div className="fixed z-50 bottom-5 right-5">
        <FloatingCallButton tenantId={tenantId} />
      </div>
    </div>
  );
}
