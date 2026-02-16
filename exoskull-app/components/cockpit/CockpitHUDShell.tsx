"use client";

import { useCockpitStore } from "@/lib/stores/useCockpitStore";
import { useResizeHandle } from "@/lib/hooks/useResizeHandle";
import { useCockpitKeys } from "@/lib/hooks/useCockpitKeys";
import { CockpitTopBar } from "./CockpitTopBar";
import { CockpitBottomBar } from "./CockpitBottomBar";
import { LeftWing } from "./LeftWing";
import { RightWing } from "./RightWing";
import { CenterViewport } from "./CenterViewport";
import { ChannelOrbs } from "./ChannelOrbs";

/**
 * CockpitHUDShell — Master CSS Grid layout for the cockpit HUD overlay.
 *
 * Grid: [leftWing] [resize] [center] [resize] [rightWing]
 * Rows: [topbar 36px] [main 1fr] [bottombar 72px]
 *
 * Container is pointer-events: none; children opt-in with pointer-events: auto.
 */
export function CockpitHUDShell() {
  useCockpitKeys();
  const leftW = useCockpitStore((s) => s.leftWingWidth);
  const rightW = useCockpitStore((s) => s.rightWingWidth);
  const setLeftW = useCockpitStore((s) => s.setLeftWingWidth);
  const setRightW = useCockpitStore((s) => s.setRightWingWidth);

  const { handleProps: leftHandleProps, isResizing: isLeftResizing } =
    useResizeHandle({
      initialWidth: leftW,
      min: 200,
      max: 400,
      onResize: setLeftW,
      side: "left",
    });

  const { handleProps: rightHandleProps, isResizing: isRightResizing } =
    useResizeHandle({
      initialWidth: rightW,
      min: 200,
      max: 400,
      onResize: setRightW,
      side: "right",
    });

  return (
    <div
      className="cockpit-hud"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10,
        display: "grid",
        gridTemplateColumns: `${leftW}px 6px 1fr 6px ${rightW}px`,
        gridTemplateRows: "36px 1fr 72px",
        pointerEvents: "none",
      }}
    >
      {/* ── Row 1: Top Bar (spans all columns) ── */}
      <div style={{ gridColumn: "1 / -1", pointerEvents: "auto" }}>
        <CockpitTopBar />
      </div>

      {/* ── Row 2: Left Wing ── */}
      <div style={{ pointerEvents: "auto", overflow: "hidden" }}>
        <LeftWing />
      </div>

      {/* ── Row 2: Left Resize Handle ── */}
      <div
        className={`hud-resize-handle ${isLeftResizing ? "resizing" : ""}`}
        style={{ pointerEvents: "auto", cursor: "col-resize" }}
        onMouseDown={leftHandleProps.onMouseDown}
      />

      {/* ── Row 2: Center Viewport ── */}
      <div style={{ pointerEvents: "auto", overflow: "hidden", minWidth: 0 }}>
        <CenterViewport />
      </div>

      {/* ── Row 2: Right Resize Handle ── */}
      <div
        className={`hud-resize-handle ${isRightResizing ? "resizing" : ""}`}
        style={{ pointerEvents: "auto", cursor: "col-resize" }}
        onMouseDown={rightHandleProps.onMouseDown}
      />

      {/* ── Row 2: Right Wing ── */}
      <div style={{ pointerEvents: "auto", overflow: "hidden" }}>
        <RightWing />
      </div>

      {/* ── Row 3: Bottom Bar (spans all columns) ── */}
      <div style={{ gridColumn: "1 / -1", pointerEvents: "auto" }}>
        <CockpitBottomBar />
      </div>

      {/* ── Channel Orbs (floating, top-right) ── */}
      <ChannelOrbs />
    </div>
  );
}
