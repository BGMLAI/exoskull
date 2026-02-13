/**
 * DualInterface — The core of ExoSkull's new UX paradigm
 *
 * Two interpenetrating interfaces:
 *
 * MODE: CHAT (default)
 * ┌─────────────────────────────┐
 * │                             │
 * │        Chat River           │
 * │       (full screen)         │
 * │                             │
 * │                    ┌──────┐ │
 * │                    │ Mini │ │
 * │                    │ Graph│ │
 * │                    └──────┘ │
 * │  [input bar]                │
 * └─────────────────────────────┘
 *
 * MODE: GRAPH (after clicking miniature / poles)
 * ┌─────────────────────────────┐
 * │                             │
 * │       Tree / Graph          │
 * │      (full screen)          │
 * │                             │
 * │                             │
 * │ ┌────┐                      │
 * │ │Chat│                      │
 * │ │ ☁️ │                      │
 * │ └────┘                      │
 * └─────────────────────────────┘
 *
 * No menu, no settings page, no home.
 * Everything flows from Chat or the Tree system.
 */
"use client";

import React, { useCallback, useState } from "react";
import { useInterfaceStore } from "@/lib/stores/useInterfaceStore";
import { cn } from "@/lib/utils";
import { UnifiedStream } from "@/components/stream/UnifiedStream";
import { TreeGraph, type TreeNode } from "./TreeGraph";
import { GraphMiniature } from "./GraphMiniature";
import { ChatBubble } from "./ChatBubble";
import { NeuralBackground } from "@/components/ui/NeuralBackground";
import { FloatingCallButton } from "@/components/voice/FloatingCallButton";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface DualInterfaceProps {
  tenantId: string;
  iorsName?: string;
}

export function DualInterface({ tenantId, iorsName }: DualInterfaceProps) {
  const { mode, isTransitioning } = useInterfaceStore();
  const [recentMessages, setRecentMessages] = useState<
    Array<{ id: string; role: "user" | "ai"; content: string; timestamp: Date }>
  >([]);

  // Track chat messages for the bubble preview
  // This is a simplified version — in production, share state with UnifiedStream
  const handleChatAboutNode = useCallback((node: TreeNode) => {
    // This will trigger a message in chat context
    // For now, we set focus and switch to chat mode
    console.log("[DualInterface] Chat about node:", node.name);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Neural background — always present, subtle */}
      <NeuralBackground
        nodeCount={8}
        pulseIntensity="subtle"
        className="fixed inset-0 z-0"
      />

      {/* ============================================================ */}
      {/* CHAT MODE: Chat is primary, graph miniature in corner        */}
      {/* ============================================================ */}
      <div
        className={cn(
          "absolute inset-0 z-10",
          "transition-all duration-500 ease-out-expo",
          mode === "chat"
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-95 pointer-events-none",
        )}
      >
        {/* Chat title bar — minimal, non-intrusive */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2.5 bg-background/60 backdrop-blur-md border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <h1 className="text-sm font-semibold text-foreground">
                {iorsName || "ExoSkull"}
              </h1>
            </div>
            <span className="text-[10px] text-muted-foreground/50 hidden sm:inline">
              wpisz / aby zobaczyć komendy
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>

        {/* Chat river — full height below the minimal bar */}
        <div className="absolute inset-0 pt-11">
          <UnifiedStream className="h-full" />
        </div>

        {/* Graph miniature — bottom right corner */}
        <GraphMiniature />
      </div>

      {/* ============================================================ */}
      {/* GRAPH MODE: Graph is primary, chat bubble in corner          */}
      {/* ============================================================ */}
      <div
        className={cn(
          "absolute inset-0 z-10",
          "transition-all duration-500 ease-out-expo",
          mode === "graph"
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-105 pointer-events-none",
        )}
      >
        {/* Full screen tree graph */}
        <TreeGraph onChatAboutNode={handleChatAboutNode} />

        {/* Chat bubble — bottom left */}
        <ChatBubble recentMessages={recentMessages} unreadCount={0} />
      </div>

      {/* ============================================================ */}
      {/* SHARED ELEMENTS — always visible                             */}
      {/* ============================================================ */}

      {/* Floating voice call button — adapts position based on mode */}
      <div
        className={cn(
          "fixed z-50 transition-all duration-500",
          mode === "chat" ? "bottom-6 left-6" : "bottom-6 right-6",
        )}
      >
        <FloatingCallButton tenantId={tenantId} />
      </div>

      {/* Transition overlay — brief flash during mode switch */}
      {isTransitioning && (
        <div className="fixed inset-0 z-[100] pointer-events-none">
          <div className="absolute inset-0 bg-background/20 backdrop-blur-sm animate-pulse" />
        </div>
      )}
    </div>
  );
}
