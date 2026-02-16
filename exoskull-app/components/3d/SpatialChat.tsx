/**
 * @deprecated Replaced by `components/cockpit/CenterViewport.tsx` + `UnifiedStream` in normal mode (Phase 8 — Cockpit HUD).
 * Kept for reference. The stripMarkdown/truncate utils were extracted to `lib/cockpit/utils.ts`.
 */
"use client";

import { useEffect, useRef } from "react";
import { useSpatialChatStore } from "@/lib/stores/useSpatialChatStore";

const MAX_DISPLAY = 8;
const MAX_CONTENT_LENGTH = 300;

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/```[\s\S]*?```/g, "[kod]")
    .replace(/`(.+?)`/g, "$1");
}

function truncate(text: string, max: number): string {
  const cleaned = stripMarkdown(text);
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max) + "...";
}

/**
 * SpatialChat — renders messages as an HTML overlay above the chat input bar.
 * Reads from useSpatialChatStore (fed by UnifiedStream in spatialMode).
 * NOT a 3D component — purely DOM.
 */
export default function SpatialChat() {
  const messages = useSpatialChatStore((s) => s.messages);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visibleMessages = messages.slice(-MAX_DISPLAY);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [
    visibleMessages.length,
    visibleMessages[visibleMessages.length - 1]?.content,
  ]);

  if (visibleMessages.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxHeight: "40vh",
        overflowY: "auto",
        paddingBottom: 8,
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(255,255,255,0.15) transparent",
        maskImage:
          "linear-gradient(to bottom, transparent 0%, black 15%, black 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, black 15%, black 100%)",
      }}
    >
      {visibleMessages.map((msg) => {
        const isUser = msg.role === "user";
        const displayContent = truncate(msg.content, MAX_CONTENT_LENGTH);

        return (
          <div
            key={msg.id}
            style={{
              display: "flex",
              justifyContent: isUser ? "flex-end" : "flex-start",
              paddingLeft: isUser ? 48 : 0,
              paddingRight: isUser ? 0 : 48,
            }}
          >
            <div
              style={{
                background: isUser
                  ? "rgba(6, 182, 212, 0.12)"
                  : "rgba(139, 92, 246, 0.12)",
                border: isUser
                  ? "1px solid rgba(6, 182, 212, 0.25)"
                  : "1px solid rgba(139, 92, 246, 0.25)",
                borderRadius: 16,
                padding: "10px 14px",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                color: "rgba(255,255,255,0.9)",
                fontSize: 14,
                lineHeight: 1.5,
                maxWidth: 480,
                whiteSpace: "pre-wrap" as const,
                wordBreak: "break-word" as const,
                textShadow: "0 1px 2px rgba(0,0,0,0.4)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: isUser
                    ? "rgba(6, 182, 212, 0.6)"
                    : "rgba(139, 92, 246, 0.6)",
                  marginBottom: 4,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase" as const,
                }}
              >
                {isUser ? "Ty" : "ExoSkull"}
              </div>
              {displayContent}
              {msg.isStreaming && (
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: isUser
                      ? "rgba(6, 182, 212, 0.8)"
                      : "rgba(139, 92, 246, 0.8)",
                    marginLeft: 6,
                    verticalAlign: "middle",
                    animation: "spatialChatPulse 1s ease-in-out infinite",
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
      <style>{`
        @keyframes spatialChatPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
