"use client";

import { useEffect, useRef, useState } from "react";
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

  // Track window dimensions for MindMap3D
  const [dims, setDims] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const update = () =>
      setDims({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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
      <div className="fixed inset-0 z-0 pointer-events-auto">
        <MindMap3D width={dims.w || undefined} height={dims.h || undefined} />
      </div>

      {/* z-10: Floating panels + PanelDock */}
      <FloatingPanelManager tenantId={tenantId} />

      {/* z-40: Quick input bar (above PanelDock, below controls) */}
      <QuickInput tenantId={tenantId} />
    </>
  );
}
