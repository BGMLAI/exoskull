"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { UnifiedStream } from "./UnifiedStream";
import { SharedWorkspace } from "@/components/workspace/SharedWorkspace";
import { useWorkspaceStore } from "@/lib/stores/useWorkspaceStore";
import { PanelRightOpen } from "lucide-react";

export function ChatLayout() {
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("exo-tts-enabled") === "true";
  });

  const toggleTTS = useCallback(() => {
    setTtsEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("exo-tts-enabled", String(next));
      return next;
    });
  }, []);

  const { isOpen, panelWidth, setPanelWidth, toggleWorkspace } =
    useWorkspaceStore();

  // ── Resize handle ─────────────────────────────────────────────────────
  const isResizing = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing.current || !containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const newWidth = containerRect.right - e.clientX;
        const clamped = Math.max(
          320,
          Math.min(newWidth, containerRect.width * 0.6),
        );
        setPanelWidth(clamped);
      };

      const handleMouseUp = () => {
        isResizing.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [setPanelWidth],
  );

  // ── Mobile detection ──────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <div ref={containerRef} className="flex h-full relative">
      <UnifiedStream
        className="flex-1"
        ttsEnabled={ttsEnabled}
        onToggleTTS={toggleTTS}
      />

      {/* Workspace toggle button (when closed) */}
      {!isOpen && (
        <button
          onClick={toggleWorkspace}
          className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-background/80 backdrop-blur-sm border border-border/50 hover:bg-muted transition-colors"
          title="Open workspace"
        >
          <PanelRightOpen className="h-4 w-4 text-muted-foreground" />
        </button>
      )}

      {/* Workspace panel */}
      {isOpen && (
        <>
          {isMobile ? (
            /* Mobile: full-screen overlay */
            <div className="fixed inset-0 z-50 bg-background workspace-overlay">
              <SharedWorkspace />
            </div>
          ) : (
            /* Desktop: side panel with resize handle */
            <div
              className="relative hidden lg:flex"
              style={{ width: panelWidth }}
            >
              {/* Resize handle */}
              <div
                className="workspace-resize-handle left-0"
                onMouseDown={handleMouseDown}
              />
              <SharedWorkspace />
            </div>
          )}
        </>
      )}
    </div>
  );
}
