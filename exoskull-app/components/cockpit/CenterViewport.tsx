"use client";

import { useCockpitStore } from "@/lib/stores/useCockpitStore";
import { UnifiedStream } from "@/components/stream/UnifiedStream";
import { PreviewPane } from "./PreviewPane";

/**
 * CenterViewport — Chat/Preview switcher.
 *
 * Both layers stay mounted (opacity toggle) to preserve:
 * - SSE connection in UnifiedStream
 * - Scroll position in chat
 * - No remount cost when toggling
 */
export function CenterViewport() {
  const centerMode = useCockpitStore((s) => s.centerMode);
  const isChat = centerMode === "chat";

  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      {/* Chat layer — always mounted */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: isChat ? 1 : 0,
          pointerEvents: isChat ? "auto" : "none",
          transition: "opacity 200ms ease",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <UnifiedStream className="flex-1 bg-transparent" />
      </div>

      {/* Preview layer — always mounted */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: isChat ? 0 : 1,
          pointerEvents: isChat ? "none" : "auto",
          transition: "opacity 200ms ease",
          transform: isChat ? "translateX(4px)" : "translateX(0)",
        }}
      >
        <PreviewPane />
      </div>
    </div>
  );
}
