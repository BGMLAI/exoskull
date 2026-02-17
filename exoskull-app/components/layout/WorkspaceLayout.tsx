"use client";

/**
 * WorkspaceLayout — NotebookLM-style three-panel layout with floating chat.
 *
 * ┌─────────────┬──────────────────────┬──────────────┐
 * │ Sources     │   MindMap3D          │ Studio       │
 * │ (collapsible│                      │ (collapsible)│
 * │  280px)     │   ┌──────────────┐   │  320px)      │
 * │             │   │ floating     │   │              │
 * │ - docs      │   │ chat area    │   │ - summaries  │
 * │ - links     │   │ (resizable)  │   │ - notes      │
 * │ - refs      │   └──────────────┘   │ - export     │
 * └─────────────┴──────────────────────┴──────────────┘
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { MindMap3D } from "@/components/mindmap/MindMap3D";
import { SourcesPanel } from "./SourcesPanel";
import { StudioPanel } from "./StudioPanel";
import { UnifiedStream } from "@/components/stream/UnifiedStream";
import { cn } from "@/lib/utils";
import {
  PanelLeftOpen,
  PanelLeftClose,
  PanelRightOpen,
  PanelRightClose,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface WorkspaceLayoutProps {
  tenantId: string;
}

const CHAT_MIN_H = 120;
const CHAT_DEFAULT_H = 300;
const CHAT_MAX_H = 600;

export function WorkspaceLayout({ tenantId }: WorkspaceLayoutProps) {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(320);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatHeight, setChatHeight] = useState(CHAT_DEFAULT_H);
  const mainRef = useRef<HTMLDivElement>(null);
  const [mainSize, setMainSize] = useState({ width: 0, height: 0 });

  // Drag state for chat resize
  const chatDragging = useRef(false);
  const chatStartY = useRef(0);
  const chatStartH = useRef(0);

  // Track main panel size for MindMap3D
  useEffect(() => {
    if (!mainRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setMainSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(mainRef.current);
    return () => observer.disconnect();
  }, []);

  // Chat resize drag handler
  const onChatDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      chatDragging.current = true;
      chatStartY.current = e.clientY;
      chatStartH.current = chatHeight;
    },
    [chatHeight],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!chatDragging.current) return;
      const delta = chatStartY.current - e.clientY;
      setChatHeight(
        Math.max(CHAT_MIN_H, Math.min(CHAT_MAX_H, chatStartH.current + delta)),
      );
    };
    const onUp = () => {
      chatDragging.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Panel resize handle drags
  const handleResizeLeft = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = leftWidth;
      const onMove = (me: MouseEvent) => {
        setLeftWidth(
          Math.max(200, Math.min(400, startWidth + (me.clientX - startX))),
        );
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [leftWidth],
  );

  const handleResizeRight = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = rightWidth;
      const onMove = (me: MouseEvent) => {
        setRightWidth(
          Math.max(200, Math.min(450, startWidth + (startX - me.clientX))),
        );
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [rightWidth],
  );

  // MindMap height = total height minus chat if open
  const mindmapHeight = chatOpen
    ? (mainSize.height || window.innerHeight) - chatHeight
    : mainSize.height || window.innerHeight;

  return (
    <div className="fixed inset-0 flex bg-[#050510] overflow-hidden">
      {/* ── Left Panel: Sources ── */}
      {leftOpen ? (
        <div
          className="relative flex-shrink-0 border-r border-cyan-900/20 bg-[#0a0a1a]/90 backdrop-blur-sm arwes-frame"
          style={{ width: leftWidth }}
        >
          <div className="absolute top-2 right-2 z-10">
            <button
              onClick={() => setLeftOpen(false)}
              className="p-1.5 rounded hover:bg-white/5 text-slate-500 hover:text-white transition-colors"
              title="Zamknij panel zrodel"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
          <SourcesPanel tenantId={tenantId} />
          <div
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-cyan-500/30 active:bg-cyan-500/50 transition-colors z-20"
            onMouseDown={handleResizeLeft}
          />
        </div>
      ) : (
        <div className="flex-shrink-0 w-10 border-r border-cyan-900/20 bg-[#0a0a1a]/60 flex items-start justify-center pt-3">
          <button
            onClick={() => setLeftOpen(true)}
            className="p-1.5 rounded hover:bg-white/5 text-slate-500 hover:text-cyan-400 transition-colors"
            title="Otworz panel zrodel"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Center: MindMap3D + Floating Chat ── */}
      <div ref={mainRef} className="flex-1 flex flex-col relative min-w-0">
        {/* Mind Map area (takes remaining space) */}
        <div
          className="flex-1 relative min-h-0"
          style={{ height: mindmapHeight }}
        >
          <MindMap3D
            width={mainSize.width || undefined}
            height={mindmapHeight || undefined}
          />
        </div>

        {/* ── Floating Chat Panel (bottom of center) ── */}
        <div
          className={cn(
            "relative flex-shrink-0 bg-[#0a0a1a]/95 backdrop-blur-md border-t border-cyan-900/30 transition-all duration-200",
            !chatOpen && "border-t-0",
          )}
          style={{ height: chatOpen ? chatHeight : 0, overflow: "hidden" }}
        >
          {chatOpen && (
            <>
              {/* Drag handle to resize chat */}
              <div
                onMouseDown={onChatDragStart}
                className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-10 flex items-center justify-center hover:bg-cyan-900/20 transition-colors"
              >
                <div className="w-8 h-0.5 rounded-full bg-cyan-800/40" />
              </div>

              {/* Chat content */}
              <div className="h-full pt-2 flex flex-col">
                <UnifiedStream className="flex-1 bg-transparent" />
              </div>
            </>
          )}
        </div>

        {/* Chat toggle button (always visible at bottom-center) */}
        <button
          onClick={() => setChatOpen(!chatOpen)}
          className={cn(
            "absolute z-20 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 rounded-t-lg text-[11px] font-mono transition-all",
            chatOpen
              ? "bottom-0 translate-y-[-100%] bg-transparent text-cyan-500 hover:text-cyan-300"
              : "bottom-3 bg-[#0a0a1a]/90 backdrop-blur border border-cyan-900/30 border-b-0 text-cyan-400 hover:text-white hover:bg-cyan-900/30",
          )}
          style={chatOpen ? { bottom: chatHeight } : undefined}
          title={chatOpen ? "Zamknij chat" : "Otworz chat"}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {chatOpen ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <>
              Chat
              <ChevronUp className="w-3 h-3" />
            </>
          )}
        </button>
      </div>

      {/* ── Right Panel: Studio ── */}
      {rightOpen ? (
        <div
          className="relative flex-shrink-0 border-l border-cyan-900/20 bg-[#0a0a1a]/90 backdrop-blur-sm arwes-frame"
          style={{ width: rightWidth }}
        >
          <div className="absolute top-2 left-2 z-10">
            <button
              onClick={() => setRightOpen(false)}
              className="p-1.5 rounded hover:bg-white/5 text-slate-500 hover:text-white transition-colors"
              title="Zamknij panel studio"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>
          <StudioPanel tenantId={tenantId} />
          <div
            className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize hover:bg-cyan-500/30 active:bg-cyan-500/50 transition-colors z-20"
            onMouseDown={handleResizeRight}
          />
        </div>
      ) : (
        <div className="flex-shrink-0 w-10 border-l border-cyan-900/20 bg-[#0a0a1a]/60 flex items-start justify-center pt-3">
          <button
            onClick={() => setRightOpen(true)}
            className="p-1.5 rounded hover:bg-white/5 text-slate-500 hover:text-cyan-400 transition-colors"
            title="Otworz panel studio"
          >
            <PanelRightOpen className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
