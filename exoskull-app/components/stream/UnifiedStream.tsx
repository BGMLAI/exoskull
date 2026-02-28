"use client";

import { StreamEventRouter } from "./StreamEventRouter";
import { VoiceInputBar } from "./VoiceInputBar";
import { EmptyState } from "./EmptyState";
import { ThreadBranch, ThreadSidebar } from "./ThreadBranch";
import { Loader2, X, Reply } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatEngine } from "@/lib/hooks/useChatEngine";
import type { StreamEvent } from "@/lib/stream/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface UnifiedStreamProps {
  className?: string;
  spatialMode?: boolean;
  ttsEnabled?: boolean;
  onToggleTTS?: () => void;
}

// ---------------------------------------------------------------------------
// Component — thin rendering shell, logic lives in useChatEngine
// ---------------------------------------------------------------------------

export function UnifiedStream({
  className,
  spatialMode,
  ttsEnabled: ttsEnabledProp,
  onToggleTTS: onToggleTTSProp,
}: UnifiedStreamProps) {
  const engine = useChatEngine({
    ttsEnabled: ttsEnabledProp,
    onToggleTTS: onToggleTTSProp,
  });

  // Time separator helper
  function renderTimeSeparator(event: StreamEvent, prev: StreamEvent) {
    const gap = event.timestamp.getTime() - prev.timestamp.getTime();
    if (gap <= 60 * 60 * 1000) return null;

    const now = new Date();
    const isToday = event.timestamp.toDateString() === now.toDateString();
    const isYesterday =
      event.timestamp.toDateString() ===
      new Date(now.getTime() - 86400000).toDateString();
    const label = isToday
      ? `Dzisiaj, ${event.timestamp.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`
      : isYesterday
        ? `Wczoraj, ${event.timestamp.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`
        : event.timestamp.toLocaleDateString("pl-PL", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });

    return (
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[10px] text-muted-foreground/60">{label}</span>
        <div className="flex-1 h-px bg-border" />
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col h-full relative", className)}
      onDragOver={engine.handleDragOver}
      onDragLeave={engine.handleDragLeave}
      onDrop={engine.handleDrop}
    >
      {/* Drag overlay */}
      {engine.isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg">
          <p className="text-lg font-medium text-primary">Upusc pliki tutaj</p>
        </div>
      )}

      {!spatialMode && (
        <div className="flex flex-1 min-h-0">
          {/* Stream area */}
          <div className="flex-1 flex flex-col min-w-0">
            <div
              ref={engine.scrollRef}
              onScroll={engine.handleScroll}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
            >
              {!engine.historyLoaded && (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
                </div>
              )}

              {engine.historyLoaded &&
                engine.events.length === 0 &&
                !engine.isLoading && (
                  <EmptyState
                    onQuickAction={(text) => engine.sendMessage(text, "text")}
                  />
                )}

              {engine.events.map((event, idx) => {
                const isReplyEvent = !!event.replyTo;
                let timeSeparator: React.ReactNode = null;
                if (idx > 0 && !isReplyEvent) {
                  timeSeparator = renderTimeSeparator(
                    event,
                    engine.events[idx - 1],
                  );
                }
                const replies = engine.threadMap.get(event.id) || [];

                return (
                  <div key={event.id}>
                    {timeSeparator}
                    <StreamEventRouter
                      event={event}
                      onReply={engine.handleReply}
                    />
                    {replies.length > 0 && (
                      <ThreadBranch
                        parentEvent={event}
                        replies={replies}
                        onReply={engine.handleReply}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Thread sidebar */}
          {engine.activeThreadEvent && (
            <ThreadSidebar
              parentEvent={engine.activeThreadEvent}
              replies={engine.activeThreadReplies}
              onClose={() => engine.setActiveThread(null)}
              onReply={engine.handleReply}
            />
          )}
        </div>
      )}

      {/* Reply-to preview strip */}
      {engine.replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 border-t bg-muted/30">
          <Reply className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium text-primary">
              {engine.replyTo.senderRole === "user"
                ? "Ty"
                : engine.replyTo.senderRole === "ai"
                  ? "ExoSkull"
                  : "System"}
            </span>
            <p className="text-xs text-muted-foreground truncate">
              {engine.replyTo.preview}
            </p>
          </div>
          <button
            onClick={() => engine.setReplyTo(null)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input bar */}
      <VoiceInputBar
        onSendText={(text) => engine.sendMessage(text, "text")}
        onSendVoice={(transcript) =>
          engine.sendMessage(transcript, "voice_transcript")
        }
        onFileUpload={engine.handleFileUpload}
        isLoading={engine.isLoading}
        ttsEnabled={engine.ttsEnabled}
        isSpeaking={engine.isSpeaking}
        onToggleTTS={engine.toggleTTS}
      />
    </div>
  );
}
