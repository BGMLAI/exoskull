"use client";

import { CyberpunkScene } from "@/components/3d/CyberpunkScene";
import { CockpitHUDShell } from "@/components/cockpit/CockpitHUDShell";
import { ToolExecutionOverlay } from "./ToolExecutionOverlay";
import { CodeSidebar } from "./CodeSidebar";
import { FloatingCallButton } from "@/components/voice/FloatingCallButton";
import { OrbContextMenuOverlay } from "@/components/3d/OrbContextMenu";
import { useCockpitStore } from "@/lib/stores/useCockpitStore";
import { ThemeSwitcher } from "@/components/ui/ThemeSwitcher";
import { cn } from "@/lib/utils";

interface CyberpunkDashboardProps {
  tenantId: string;
  iorsName?: string;
}

/**
 * CyberpunkDashboard — Chat-first cockpit on a 3D grid.
 *
 * Single view: R3F Canvas (3D scene background) + CockpitHUDShell overlay with chat.
 * Mindmap mode accessible via /mindmap slash command (not default).
 */
export function CyberpunkDashboard({ tenantId }: CyberpunkDashboardProps) {
  const codeSidebarOpen = useCockpitStore((s) => s.codeSidebarOpen);

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      {/* ── z-0: 3D Scene (world orbs, environment) ── */}
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
      <div
        className={cn(
          "fixed z-50 top-4 flex items-center gap-2 transition-all duration-300",
          codeSidebarOpen ? "right-[496px]" : "right-4",
        )}
      >
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
