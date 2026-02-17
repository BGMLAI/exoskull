"use client";

import { useRef, useEffect, useCallback } from "react";
import { X, Minus, GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useFloatingPanelsStore,
  type PanelId,
} from "@/lib/stores/useFloatingPanelsStore";

const MIN_W = 200;
const MIN_H = 150;

export interface FloatingPanelProps {
  id: PanelId;
  title: string;
  icon: React.ReactNode;
  accentColor?: string;
  /** Default true — chat passes false since it should not be closable */
  closable?: boolean;
  children: React.ReactNode;
}

export function FloatingPanel({
  id,
  title,
  icon,
  accentColor,
  closable = true,
  children,
}: FloatingPanelProps) {
  const panel = useFloatingPanelsStore((s) => s.panels[id]);
  const focusPanel = useFloatingPanelsStore((s) => s.focusPanel);
  const minimizePanel = useFloatingPanelsStore((s) => s.minimizePanel);
  const closePanel = useFloatingPanelsStore((s) => s.closePanel);
  const updatePanel = useFloatingPanelsStore((s) => s.updatePanel);

  // Drag refs — no re-renders during drag, only on mouseup
  const dragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startPanelX = useRef(0);
  const startPanelY = useRef(0);

  // Resize refs
  const resizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartY = useRef(0);
  const startW = useRef(0);
  const startH = useRef(0);

  // Live position/size during drag — stored in a ref to avoid re-renders
  const panelRef = useRef<HTMLDivElement>(null);

  // Apply position/size directly via style for smooth drag
  const applyStyle = useCallback(
    (x: number, y: number, w: number, h: number) => {
      if (!panelRef.current) return;
      panelRef.current.style.left = `${x}px`;
      panelRef.current.style.top = `${y}px`;
      panelRef.current.style.width = `${w}px`;
      panelRef.current.style.height = `${h}px`;
    },
    [],
  );

  // Sync from store to DOM when panel state changes (not during drag)
  useEffect(() => {
    if (!panel || dragging.current || resizing.current) return;
    if (panelRef.current) {
      panelRef.current.style.left = `${panel.x}px`;
      panelRef.current.style.top = `${panel.y}px`;
      panelRef.current.style.width = `${panel.w}px`;
      panelRef.current.style.height = `${panel.h}px`;
      panelRef.current.style.zIndex = String(panel.zIndex);
    }
  }, [panel]);

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const onHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("button")) return; // don't drag on buttons
      e.preventDefault();
      focusPanel(id);
      dragging.current = true;
      startX.current = e.clientX;
      startY.current = e.clientY;
      startPanelX.current = panel?.x ?? 0;
      startPanelY.current = panel?.y ?? 0;
    },
    [focusPanel, id, panel],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - startX.current;
      const dy = e.clientY - startY.current;
      const newX = Math.max(0, startPanelX.current + dx);
      const newY = Math.max(0, startPanelY.current + dy);
      // Apply directly to DOM for zero-lag drag
      if (panelRef.current) {
        panelRef.current.style.left = `${newX}px`;
        panelRef.current.style.top = `${newY}px`;
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      const dx = e.clientX - startX.current;
      const dy = e.clientY - startY.current;
      const newX = Math.max(0, startPanelX.current + dx);
      const newY = Math.max(0, startPanelY.current + dy);
      updatePanel(id, { x: newX, y: newY });
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [id, updatePanel]);

  // ── Resize handlers ────────────────────────────────────────────────────────

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizing.current = true;
      resizeStartX.current = e.clientX;
      resizeStartY.current = e.clientY;
      startW.current = panel?.w ?? MIN_W;
      startH.current = panel?.h ?? MIN_H;
    },
    [panel],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const dw = e.clientX - resizeStartX.current;
      const dh = e.clientY - resizeStartY.current;
      const newW = Math.max(MIN_W, startW.current + dw);
      const newH = Math.max(MIN_H, startH.current + dh);
      applyStyle(
        parseFloat(panelRef.current?.style.left ?? "0"),
        parseFloat(panelRef.current?.style.top ?? "0"),
        newW,
        newH,
      );
    };
    const onMouseUp = (e: MouseEvent) => {
      if (!resizing.current) return;
      resizing.current = false;
      const dw = e.clientX - resizeStartX.current;
      const dh = e.clientY - resizeStartY.current;
      const newW = Math.max(MIN_W, startW.current + dw);
      const newH = Math.max(MIN_H, startH.current + dh);
      updatePanel(id, { w: newW, h: newH });
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [id, updatePanel, applyStyle]);

  if (!panel || panel.minimized) return null;

  return (
    <div
      ref={panelRef}
      className={cn(
        "fixed flex flex-col",
        "bg-card border border-border rounded-xl shadow-lg",
        "overflow-hidden select-none",
      )}
      style={{
        left: panel.x,
        top: panel.y,
        width: panel.w,
        height: panel.h,
        zIndex: panel.zIndex,
        // Accent border-top
        borderTop: accentColor ? `2px solid ${accentColor}` : undefined,
      }}
      onMouseDown={() => focusPanel(id)}
    >
      {/* ── Header ── */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2",
          "bg-card/80 border-b border-border",
          "cursor-grab active:cursor-grabbing flex-shrink-0",
        )}
        onMouseDown={onHeaderMouseDown}
      >
        <span className="text-muted-foreground w-4 h-4 flex-shrink-0">
          {icon}
        </span>
        <GripHorizontal className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
        <span className="flex-1 text-sm font-medium text-foreground truncate">
          {title}
        </span>

        {/* Minimize */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            minimizePanel(id);
          }}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        {/* Close */}
        {closable && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              closePanel(id);
            }}
            className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {children}
      </div>

      {/* ── Resize handle (bottom-right corner) ── */}
      <div
        className={cn(
          "absolute bottom-0 right-0 w-4 h-4",
          "cursor-nwse-resize",
          "opacity-30 hover:opacity-70 transition-opacity",
        )}
        onMouseDown={onResizeMouseDown}
        title="Resize"
      >
        {/* Visual grip dots */}
        <svg
          viewBox="0 0 16 16"
          className="w-full h-full text-muted-foreground"
          fill="currentColor"
        >
          <circle cx="4" cy="12" r="1.5" />
          <circle cx="8" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="12" cy="8" r="1.5" />
          <circle cx="12" cy="4" r="1.5" />
        </svg>
      </div>
    </div>
  );
}
