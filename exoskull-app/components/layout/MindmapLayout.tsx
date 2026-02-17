"use client";

import { useEffect, useRef } from "react";
import { MindMap3D } from "@/components/mindmap/MindMap3D";
import { FloatingPanelManager } from "@/components/floating/FloatingPanelManager";
import { QuickInput } from "./QuickInput";
import { useFloatingPanelsStore } from "@/lib/stores/useFloatingPanelsStore";

interface MindmapLayoutProps {
  tenantId: string;
}

/**
 * MindmapLayout — Full-viewport mindmap with floating panels overlaid.
 *
 * Architecture:
 *   z-0:  MindMap3D (fullscreen background)
 *   z-10: FloatingPanelManager (draggable panels + PanelDock)
 *   z-40: QuickInput (mini chat bar above dock)
 */
export function MindmapLayout({ tenantId }: MindmapLayoutProps) {
  const hasAutoOpened = useRef(false);
  const openPanel = useFloatingPanelsStore((s) => s.openPanel);
  const panels = useFloatingPanelsStore((s) => s.panels);

  // Auto-open chat panel on first mount if not already open
  useEffect(() => {
    if (hasAutoOpened.current) return;
    hasAutoOpened.current = true;

    if (!panels["chat"]) {
      openPanel("chat");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* z-0: MindMap3D fills entire viewport */}
      <div className="fixed inset-0 z-0">
        <MindMap3D />
      </div>

      {/* z-10: Floating panels + PanelDock */}
      <FloatingPanelManager tenantId={tenantId} />

      {/* z-40: Quick input bar (above PanelDock, below controls) */}
      <QuickInput tenantId={tenantId} />
    </>
  );
}
