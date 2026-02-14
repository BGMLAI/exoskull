/**
 * SplitHandle — The Gamma Boundary
 *
 * A draggable divider between the Consciousness Stream (left) and the
 * 6 Worlds Graph (right). In TAU philosophy, this is the Gamma border —
 * the living boundary between the analog self (A) and the digital IORS (B).
 *
 * Features:
 * - Drag to resize panels (splitRatio 0.17–0.83)
 * - Double-click to reset to 50/50
 * - Animated Gamma pulse on the border
 * - Tooltip showing current ratio + shortcut hint
 * - Keyboard shortcut Ctrl+\ to cycle through presets
 * - IORS activity indicator (thinking/building/researching dot)
 */
"use client";

import React, { useCallback, useRef, useEffect, useState } from "react";
import {
  useInterfaceStore,
  SPLIT_MIN,
  SPLIT_MAX,
} from "@/lib/stores/useInterfaceStore";
import { cn } from "@/lib/utils";
import { GripVertical } from "lucide-react";

interface SplitHandleProps {
  /** Container element ref to calculate relative drag position */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function SplitHandle({ containerRef }: SplitHandleProps) {
  const splitRatio = useInterfaceStore((s) => s.splitRatio);
  const setSplitRatio = useInterfaceStore((s) => s.setSplitRatio);
  const resetSplit = useInterfaceStore((s) => s.resetSplit);
  const cycleSplitPreset = useInterfaceStore((s) => s.cycleSplitPreset);
  const iorsActivity = useInterfaceStore((s) => s.iorsActivity);

  const handleRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // ── Activity visual mapping ───────────────────────────────────────

  const activityColor: Record<string, string> = {
    idle: "bg-muted-foreground/30",
    thinking: "bg-violet-500",
    building: "bg-amber-500",
    researching: "bg-blue-500",
  };

  const activityGlow: Record<string, string> = {
    idle: "",
    thinking: "shadow-violet-500/30",
    building: "shadow-amber-500/30",
    researching: "shadow-blue-500/30",
  };

  // ── Drag logic ────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    isDragging.current = true;
    setIsDraggingState(true);
    setShowTooltip(true);

    // Capture pointer for smooth dragging even outside the element
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = x / rect.width;

      // Clamping is handled inside setSplitRatio
      setSplitRatio(ratio);
    },
    [containerRef, setSplitRatio],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;

    isDragging.current = false;
    setIsDraggingState(false);

    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    // Fade tooltip after a short delay
    setTimeout(() => {
      if (!isDragging.current) setShowTooltip(false);
    }, 800);
  }, []);

  // ── Double-click to reset to 50/50 ───────────────────────────────

  const handleDoubleClick = useCallback(() => {
    resetSplit();
  }, [resetSplit]);

  // ── Hover tooltip ─────────────────────────────────────────────────

  const handleMouseEnter = useCallback(() => {
    if (!isDragging.current) setShowTooltip(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!isDragging.current) setShowTooltip(false);
  }, []);

  // ── Keyboard shortcut: Ctrl+\ cycles presets ─────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "\\") {
        e.preventDefault();
        cycleSplitPreset();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cycleSplitPreset]);

  // ── Derived display values ────────────────────────────────────────

  const streamPercent = Math.round(splitRatio * 100);
  const graphPercent = 100 - streamPercent;

  // Detect if ratio is near min/max bounds (for visual cue)
  const isNearMin = splitRatio <= SPLIT_MIN + 0.02;
  const isNearMax = splitRatio >= SPLIT_MAX - 0.02;

  return (
    <div
      ref={handleRef}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={streamPercent}
      aria-valuemin={Math.round(SPLIT_MIN * 100)}
      aria-valuemax={Math.round(SPLIT_MAX * 100)}
      aria-label="Resize panels — double-click to reset, Ctrl+\\ to cycle"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "relative flex-shrink-0 z-30",
        "w-3 cursor-col-resize select-none touch-none",
        "flex items-center justify-center",
        "group",
        // Smooth transitions only when NOT actively dragging
        !isDraggingState && "transition-all duration-150",
      )}
      style={{ touchAction: "none" }}
    >
      {/* ── Background track (always visible, subtle) ──────────── */}
      <div
        className={cn(
          "absolute inset-y-0 w-px left-1/2 -translate-x-1/2",
          "bg-border/40",
          "group-hover:bg-border/80",
          isDraggingState && "bg-primary/60",
          "transition-colors duration-200",
        )}
      />

      {/* ── Gamma pulse line — animated border (idle glow) ─────── */}
      <div
        className={cn(
          "absolute inset-y-0 w-[2px] left-1/2 -translate-x-1/2",
          "transition-opacity duration-200",
          // Idle: subtle pulse animation
          !isDraggingState && "gamma-pulse",
          // Hover: solid glow
          "opacity-0 group-hover:opacity-100",
          // Dragging: strong glow
          isDraggingState && "opacity-100 gamma-line-glow",
        )}
      />

      {/* ── Active drag aura — wider gradient halo ─────────────── */}
      {isDraggingState && (
        <div className="absolute inset-y-0 -left-3 -right-3 pointer-events-none gamma-active-aura" />
      )}

      {/* ── Central grip indicator ─────────────────────────────── */}
      <div
        className={cn(
          "relative z-10 flex flex-col items-center justify-center",
          "w-5 h-10 rounded-full",
          "bg-background/80 backdrop-blur-sm",
          "border border-border/50",
          "group-hover:border-primary/40 group-hover:bg-background",
          isDraggingState && "border-primary/60 bg-background scale-110",
          "shadow-sm group-hover:shadow-md",
          iorsActivity !== "idle" && `shadow-lg ${activityGlow[iorsActivity]}`,
          "transition-all duration-200",
        )}
      >
        <GripVertical className="w-3 h-3 text-muted-foreground/60 group-hover:text-foreground/80" />

        {/* IORS activity dot — shows what IORS is doing */}
        {iorsActivity !== "idle" && (
          <div
            className={cn(
              "absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full",
              activityColor[iorsActivity],
              "animate-pulse",
              "ring-2 ring-background",
            )}
          />
        )}
      </div>

      {/* ── Ratio tooltip ──────────────────────────────────────── */}
      {showTooltip && (
        <div
          className={cn(
            "absolute -top-9 left-1/2 -translate-x-1/2",
            "px-2.5 py-1 rounded-lg",
            "bg-popover/95 backdrop-blur-sm",
            "border border-border/50",
            "shadow-lg",
            "text-[10px] font-mono text-foreground/80",
            "whitespace-nowrap pointer-events-none",
            "animate-in fade-in zoom-in-95 duration-150",
            // Bound indicator coloring
            isNearMin && "border-amber-500/30",
            isNearMax && "border-emerald-500/30",
          )}
        >
          <span className={cn(isNearMin && "text-amber-500")}>
            {streamPercent}%
          </span>
          <span className="text-muted-foreground/40 mx-1">·</span>
          <span className={cn(isNearMax && "text-emerald-500")}>
            {graphPercent}%
          </span>
          <span className="ml-1.5 text-muted-foreground/40 kbd-hint">
            Ctrl+\
          </span>
        </div>
      )}

      {/* ── Extended hit area — wider invisible zone for easier grab */}
      <div className="absolute inset-y-0 -left-2 -right-2 pointer-events-none" />
    </div>
  );
}
