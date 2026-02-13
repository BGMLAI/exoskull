/**
 * ConsciousnessStream — The left panel of TAU Dual Interface
 *
 * Wraps UnifiedStream (chat) + Forge (live IORS build view) + Preview (iframe)
 * in a tabbed container with responsive compact/full modes.
 *
 * Compact mode (splitRatio < 0.25):
 *   Minimal sidebar with IORS status, tab icons, and a quick input trigger.
 *
 * Full mode:
 *   Tab bar (Chat | Kuźnia | Podgląd) + tab content area.
 *   Chat tab keeps UnifiedStream always mounted (SSE persistence),
 *   hidden when other tabs are active.
 */
"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  useInterfaceStore,
  type StreamTab,
  type IorsActivity,
} from "@/lib/stores/useInterfaceStore";
import { UnifiedStream } from "@/components/stream/UnifiedStream";
import { StreamEventRouter } from "@/components/stream/StreamEventRouter";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Hammer,
  Eye,
  Send,
  Loader2,
  Terminal,
  Maximize2,
  RefreshCw,
} from "lucide-react";
import type { StreamEvent, ToolExecutionData } from "@/lib/stream/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Event types that appear in the Forge tab */
const FORGE_EVENT_TYPES = new Set([
  "tool_execution",
  "code_block",
  "system_evolution",
  "agent_action",
  "thinking_step",
]);

/** Below this splitRatio the stream panel renders compact mode */
const COMPACT_THRESHOLD = 0.25;

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TABS: Array<{
  id: StreamTab;
  label: string;
  icon: React.ElementType;
}> = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "forge", label: "Kuźnia", icon: Hammer },
  { id: "preview", label: "Podgląd", icon: Eye },
];

// ---------------------------------------------------------------------------
// IORS activity indicator config
// ---------------------------------------------------------------------------

const ACTIVITY_CONFIG: Record<
  IorsActivity,
  { color: string; pulse: boolean; label: string }
> = {
  idle: { color: "bg-primary", pulse: true, label: "Gotowy" },
  thinking: { color: "bg-amber-500", pulse: true, label: "Myśli..." },
  building: { color: "bg-teal-500", pulse: true, label: "Buduje..." },
  researching: { color: "bg-blue-500", pulse: true, label: "Szuka..." },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConsciousnessStreamProps {
  className?: string;
  iorsName?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConsciousnessStream({
  className,
  iorsName,
}: ConsciousnessStreamProps) {
  const splitRatio = useInterfaceStore((s) => s.splitRatio);
  const activeStreamTab = useInterfaceStore((s) => s.activeStreamTab);
  const setActiveStreamTab = useInterfaceStore((s) => s.setActiveStreamTab);
  const iorsActivity = useInterfaceStore((s) => s.iorsActivity);
  const resetSplit = useInterfaceStore((s) => s.resetSplit);

  const isCompact = splitRatio < COMPACT_THRESHOLD;

  // Forge events (fetched independently from chat)
  const [forgeEvents, setForgeEvents] = useState<StreamEvent[]>([]);
  const [forgeLoading, setForgeLoading] = useState(false);

  // Preview URL
  const [previewUrl] = useState<string | null>(null);

  // ── Fetch forge events when tab becomes active ────────────────────────

  useEffect(() => {
    if (activeStreamTab === "forge") {
      void fetchForgeEvents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStreamTab]);

  const fetchForgeEvents = useCallback(async () => {
    setForgeLoading(true);
    try {
      const res = await fetch("/api/stream/events?limit=50");
      if (!res.ok) return;
      const data = await res.json();

      const events: StreamEvent[] = (data.events ?? [])
        .filter((e: StreamEvent) => FORGE_EVENT_TYPES.has(e.data.type))
        .map((e: StreamEvent) => ({
          ...e,
          timestamp: new Date(e.timestamp),
        }));

      setForgeEvents(events);
    } catch (err) {
      console.error("[ConsciousnessStream] forge fetch failed:", err);
    } finally {
      setForgeLoading(false);
    }
  }, []);

  // ── Expand handler (compact → full) ───────────────────────────────────

  const handleExpand = useCallback(() => {
    resetSplit();
  }, [resetSplit]);

  const handleTabClickInCompact = useCallback(
    (tab: StreamTab) => {
      setActiveStreamTab(tab);
      handleExpand();
    },
    [setActiveStreamTab, handleExpand],
  );

  // Check if any forge tool is currently running (for activity indicator)
  const hasRunningTool = forgeEvents.some(
    (e) =>
      e.data.type === "tool_execution" &&
      (e.data as ToolExecutionData).status === "running",
  );

  const activityCfg = ACTIVITY_CONFIG[iorsActivity];

  // =====================================================================
  // COMPACT MODE
  // =====================================================================

  if (isCompact) {
    return (
      <div
        className={cn(
          "flex flex-col h-full",
          "bg-background/80 backdrop-blur-md border-r border-border/30",
          className,
        )}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-2.5 py-2 border-b border-border/20">
          <div
            className={cn(
              "w-2 h-2 rounded-full flex-shrink-0",
              activityCfg.color,
              activityCfg.pulse && "animate-pulse",
            )}
            title={activityCfg.label}
          />
          <span className="text-xs font-semibold text-foreground truncate">
            {iorsName || "IORS"}
          </span>
          <button
            onClick={handleExpand}
            className={cn(
              "ml-auto p-1 rounded",
              "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
              "transition-colors",
            )}
            title="Rozwiń panel (Ctrl+\)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── Tab icons (vertical) ───────────────────────────────── */}
        <div className="flex flex-col items-center gap-0.5 py-2 border-b border-border/10">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabClickInCompact(tab.id)}
              className={cn(
                "p-2 rounded-lg transition-colors relative",
                activeStreamTab === tab.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
              )}
              title={tab.label}
            >
              <tab.icon className="w-4 h-4" />
              {/* Activity dot for forge tab */}
              {tab.id === "forge" && hasRunningTool && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
              )}
            </button>
          ))}
        </div>

        {/* ── Spacer ─────────────────────────────────────────────── */}
        <div className="flex-1" />

        {/* ── Quick input trigger ─────────────────────────────────── */}
        <div className="p-2 border-t border-border/20">
          <button
            onClick={() => handleTabClickInCompact("chat")}
            className={cn(
              "w-full flex items-center justify-center gap-1",
              "bg-muted/30 rounded-lg px-2 py-1.5",
              "text-muted-foreground/50 hover:text-foreground hover:bg-muted/50",
              "transition-colors",
            )}
            title="Wpisz wiadomość"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>

        {/* ── Theme toggle at bottom ──────────────────────────────── */}
        <div className="px-2 pb-2 flex justify-center">
          <ThemeToggle />
        </div>
      </div>
    );
  }

  // =====================================================================
  // FULL MODE (wide panel with tabs)
  // =====================================================================

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-background/80 backdrop-blur-md",
        className,
      )}
    >
      {/* ── Tab bar ───────────────────────────────────────────────── */}
      <div className="flex items-center border-b border-border/30 bg-background/60 backdrop-blur-md">
        <div className="flex items-center gap-0.5 px-2 pt-1">
          {TABS.map((tab) => {
            const isActive = activeStreamTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveStreamTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all relative",
                  "rounded-t-lg",
                  isActive
                    ? "bg-background text-foreground border border-border/40 border-b-transparent -mb-px z-10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {/* Running indicator on forge tab */}
                {tab.id === "forge" && hasRunningTool && (
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>

        {/* Right side: IORS name + activity + theme toggle */}
        <div className="ml-auto flex items-center gap-3 pr-3">
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                activityCfg.color,
                activityCfg.pulse && "animate-pulse",
              )}
            />
            <span className="text-[10px] text-muted-foreground/60 font-medium hidden sm:inline">
              {iorsName || "IORS"}
            </span>
            {iorsActivity !== "idle" && (
              <span className="text-[10px] text-muted-foreground/40 hidden md:inline">
                — {activityCfg.label}
              </span>
            )}
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* ── Tab content ──────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 relative">
        {/* Chat — ALWAYS MOUNTED for SSE connection persistence */}
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-150",
            activeStreamTab === "chat"
              ? "opacity-100 pointer-events-auto z-10"
              : "opacity-0 pointer-events-none z-0",
          )}
        >
          <UnifiedStream className="h-full" />
        </div>

        {/* Forge — conditionally rendered */}
        {activeStreamTab === "forge" && (
          <ForgeTabContent
            events={forgeEvents}
            loading={forgeLoading}
            onRefresh={fetchForgeEvents}
          />
        )}

        {/* Preview — conditionally rendered */}
        {activeStreamTab === "preview" && (
          <PreviewTabContent url={previewUrl} />
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Forge Tab — live view of IORS build activity (tool executions, code, etc.)
// ===========================================================================

interface ForgeTabContentProps {
  events: StreamEvent[];
  loading: boolean;
  onRefresh: () => void;
}

function ForgeTabContent({ events, loading, onRefresh }: ForgeTabContentProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events]);
  // ── Loading state ─────────────────────────────────────────────────
  if (loading && events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-xs">Ładowanie aktywności kuźni...</span>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground px-8">
        <div className="p-4 rounded-full bg-muted/20">
          <Terminal className="w-8 h-8 text-muted-foreground/30" />
        </div>
        <div className="text-center space-y-1.5">
          <p className="text-sm font-medium text-foreground/70">
            Kuźnia jest cicha
          </p>
          <p className="text-xs text-muted-foreground/50 max-w-[280px]">
            Gdy IORS zacznie budować, tutaj zobaczysz na żywo wykonywane
            narzędzia, kod i postęp prac.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs",
            "text-muted-foreground hover:text-foreground",
            "bg-muted/30 hover:bg-muted/50 transition-colors",
          )}
        >
          <RefreshCw className="w-3 h-3" />
          Odśwież
        </button>
      </div>
    );
  }

  // ── Events timeline ───────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Forge header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/20 bg-[#0d1117]/20 dark:bg-[#0d1117]/40">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-teal-500" />
          <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">
            Aktywność Kuźni
          </span>
          <span className="text-[10px] text-muted-foreground/40 font-mono tabular-nums">
            ({events.length})
          </span>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className={cn(
            "flex items-center gap-1 text-[10px]",
            "text-muted-foreground/50 hover:text-foreground transition-colors",
            "disabled:opacity-30",
          )}
        >
          <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
          <span className="hidden sm:inline">Odśwież</span>
        </button>
      </div>

      {/* Scrollable event list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto chat-scroll px-3 py-2 space-y-2"
      >
        {events.map((event) => (
          <div
            key={event.id}
            className="animate-in fade-in slide-in-from-bottom-1 duration-200"
          >
            <StreamEventRouter event={event} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// Preview Tab — iframe for previewing applications IORS builds
// ===========================================================================

interface PreviewTabContentProps {
  url: string | null;
}

function PreviewTabContent({ url }: PreviewTabContentProps) {
  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground px-8">
        <div className="p-4 rounded-full bg-muted/20">
          <Eye className="w-8 h-8 text-muted-foreground/30" />
        </div>
        <div className="text-center space-y-1.5">
          <p className="text-sm font-medium text-foreground/70">
            Brak podglądu
          </p>
          <p className="text-xs text-muted-foreground/50 max-w-[280px]">
            Gdy IORS zbuduje aplikację, tutaj zobaczysz jej podgląd na żywo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <iframe
        src={url}
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms"
        title="App Preview"
      />
    </div>
  );
}
