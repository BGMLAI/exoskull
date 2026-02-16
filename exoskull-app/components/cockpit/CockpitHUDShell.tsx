"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
 * Center column = fully transparent (3D scene clickable).
 * Chat/Tree/Preview lives in a resizable bottom drawer (full width between wings).
 * Drawer can be collapsed to input-only bar (~48px) or expanded.
 *
 * Tab toggles hudMinimized: hides wings + drawer, full 3D mode.
 */

const DRAWER_MIN = 48; // collapsed: just input bar
const DRAWER_DEFAULT = 280; // comfortable chat height
const DRAWER_MAX = 600;

export function CockpitHUDShell() {
  useCockpitKeys();
  const leftW = useCockpitStore((s) => s.leftWingWidth);
  const rightW = useCockpitStore((s) => s.rightWingWidth);
  const setLeftW = useCockpitStore((s) => s.setLeftWingWidth);
  const setRightW = useCockpitStore((s) => s.setRightWingWidth);
  const hudMinimized = useCockpitStore((s) => s.hudMinimized);
  const toggleHud = useCockpitStore((s) => s.toggleHudMinimized);

  const [drawerH, setDrawerH] = useState(DRAWER_DEFAULT);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

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

  // Drawer vertical resize (drag handle at top of drawer)
  const onDrawerDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startY.current = e.clientY;
      startH.current = drawerH;
    },
    [drawerH],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startY.current - e.clientY; // drag up = bigger
      const newH = Math.max(
        DRAWER_MIN,
        Math.min(DRAWER_MAX, startH.current + delta),
      );
      setDrawerH(newH);
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const isCollapsed = drawerH <= DRAWER_MIN + 10;

  return (
    <div
      className="cockpit-hud"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10,
        display: "grid",
        gridTemplateColumns: hudMinimized
          ? "1fr"
          : `${leftW}px 6px 1fr 6px ${rightW}px`,
        gridTemplateRows: hudMinimized
          ? "36px 1fr"
          : `36px 1fr ${drawerH}px 72px`,
        pointerEvents: "none",
      }}
    >
      {/* ── Row 1: Top Bar (spans all columns) ── */}
      <div style={{ gridColumn: "1 / -1", pointerEvents: "auto" }}>
        <CockpitTopBar />
      </div>

      {!hudMinimized && (
        <>
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

          {/* ── Row 2: Center — Fully transparent, 3D scene pass-through ── */}
          <div style={{ pointerEvents: "none", minWidth: 0 }} />

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

          {/* ── Row 3: Chat Drawer (spans center 3 columns) ── */}
          <div
            style={{
              gridColumn: "1 / -1",
              pointerEvents: "none",
              position: "relative",
            }}
          >
            {/* Drawer container - inset from wings */}
            <div
              style={{
                position: "absolute",
                left: leftW + 6,
                right: rightW + 6,
                top: 0,
                bottom: 0,
                pointerEvents: "auto",
                display: "flex",
                flexDirection: "column",
                background: "rgba(5, 5, 16, 0.82)",
                backdropFilter: "blur(14px)",
                borderTop: "1px solid rgba(6, 182, 212, 0.15)",
                borderRadius: "8px 8px 0 0",
                overflow: "hidden",
              }}
            >
              {/* Drag handle to resize drawer */}
              <div
                onMouseDown={onDrawerDragStart}
                onDoubleClick={() =>
                  setDrawerH(isCollapsed ? DRAWER_DEFAULT : DRAWER_MIN)
                }
                style={{
                  height: 20,
                  cursor: "row-resize",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  userSelect: "none",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 3,
                    borderRadius: 2,
                    background: "rgba(6, 182, 212, 0.35)",
                  }}
                />
              </div>

              {/* Chat/Tree/Preview content */}
              <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
                <CenterViewport />
              </div>
            </div>
          </div>

          {/* ── Row 4: Bottom Bar (spans all columns) ── */}
          <div style={{ gridColumn: "1 / -1", pointerEvents: "auto" }}>
            <CockpitBottomBar />
          </div>
        </>
      )}

      {/* ── Toggle HUD button (always visible) ── */}
      <div
        onClick={toggleHud}
        title={hudMinimized ? "Show HUD (Tab)" : "Full 3D (Tab)"}
        style={{
          position: "fixed",
          bottom: hudMinimized ? 16 : 80,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 20,
          pointerEvents: "auto",
          cursor: "pointer",
          padding: "6px 16px",
          borderRadius: 20,
          background: hudMinimized
            ? "rgba(16, 185, 129, 0.2)"
            : "rgba(255, 255, 255, 0.06)",
          border: hudMinimized
            ? "1px solid rgba(16, 185, 129, 0.5)"
            : "1px solid rgba(255, 255, 255, 0.15)",
          color: hudMinimized ? "#10b981" : "rgba(255, 255, 255, 0.5)",
          fontSize: "11px",
          fontFamily: "monospace",
          fontWeight: 600,
          letterSpacing: "0.05em",
          transition: "all 0.2s",
        }}
      >
        {hudMinimized ? "SHOW HUD [Tab]" : "FULL 3D [Tab]"}
      </div>

      {/* ── Channel Orbs (floating, top-right) ── */}
      <ChannelOrbs />
    </div>
  );
}
