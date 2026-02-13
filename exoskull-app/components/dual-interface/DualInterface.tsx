/**
 * DualInterface — The core TAU layout for ExoSkull
 *
 * Two always-visible panels separated by a draggable Gamma boundary:
 *
 * ┌────────────────────────║────────────────────────┐
 * │   Consciousness        ║       6 Worlds         │
 * │     Stream              ║        Graph           │
 * │  (Chat + Forge)        ║   (Poles + Trees)      │
 * │                        ║                        │
 * │   splitRatio →         ║   ← (1 - splitRatio)   │
 * └────────────────────────║────────────────────────┘
 *
 * No discrete "modes" — both panels are always present.
 * The SplitHandle (Gamma border) controls the ratio.
 *
 * - Ctrl+\ cycles through split presets (stream-focused / balanced / graph-focused)
 * - Double-click the handle → reset to 50/50
 */
"use client";

import React, { useCallback, useRef } from "react";
import { useInterfaceStore } from "@/lib/stores/useInterfaceStore";
import { ConsciousnessStream } from "./ConsciousnessStream";
import { WorldsGraph, type WorldNode } from "./WorldsGraph";
import { SplitHandle } from "./SplitHandle";
import { NeuralBackground } from "@/components/ui/NeuralBackground";
import { FloatingCallButton } from "@/components/voice/FloatingCallButton";

interface DualInterfaceProps {
  tenantId: string;
  iorsName?: string;
}

export function DualInterface({ tenantId, iorsName }: DualInterfaceProps) {
  const splitRatio = useInterfaceStore((s) => s.splitRatio);
  const containerRef = useRef<HTMLDivElement>(null);

  // When user clicks "Chat about this node" in the graph
  const handleChatAboutNode = useCallback((node: WorldNode) => {
    // Future: inject node context into chat input
    console.log("[DualInterface] Chat about node:", node.name, node.worldId);
  }, []);

  return (
    <div ref={containerRef} className="fixed inset-0 overflow-hidden">
      {/* Neural background — always present, very subtle */}
      <NeuralBackground
        nodeCount={6}
        pulseIntensity="subtle"
        className="fixed inset-0 z-0"
      />

      {/* ── Main split layout ──────────────────────────────────── */}
      <div className="relative z-10 flex h-full w-full">
        {/* LEFT: Consciousness Stream */}
        <div
          className="h-full min-w-0 transition-[flex] duration-150 ease-out"
          style={{ flex: `${splitRatio} 1 0%` }}
        >
          <ConsciousnessStream iorsName={iorsName} />
        </div>

        {/* CENTER: Gamma boundary handle */}
        <SplitHandle containerRef={containerRef} />

        {/* RIGHT: 6 Worlds Graph */}
        <div
          className="h-full min-w-0 transition-[flex] duration-150 ease-out"
          style={{ flex: `${1 - splitRatio} 1 0%` }}
        >
          <WorldsGraph onChatAboutNode={handleChatAboutNode} />
        </div>
      </div>

      {/* ── Floating voice call button ─────────────────────────── */}
      <div className="fixed z-50 bottom-5 left-5">
        <FloatingCallButton tenantId={tenantId} />
      </div>
    </div>
  );
}
