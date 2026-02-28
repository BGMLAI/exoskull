"use client";

import { Loader2 } from "lucide-react";
import { StreamEventRouter } from "@/components/stream/StreamEventRouter";
import { ThreadBranch } from "@/components/stream/ThreadBranch";
import { EmptyState } from "@/components/stream/EmptyState";
import type { UseChatEngineReturn } from "@/lib/hooks/useChatEngine";
import type { StreamEvent } from "@/lib/stream/types";

interface MessageListProps {
  engine: UseChatEngineReturn;
}

/**
 * MessageList — scrollable chat stream widget.
 * Reuses all 23 StreamEventRouter renderers without changes.
 * Glass-morphism container with fade-to-transparent at top.
 */
export function MessageList({ engine }: MessageListProps) {
  return (
    <div className="relative">
      {/* Top fade gradient */}
      <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-background/80 to-transparent z-10 pointer-events-none" />

      <div
        ref={engine.scrollRef}
        onScroll={engine.handleScroll}
        className="overflow-y-auto px-4 py-3 space-y-2 max-h-[60vh] scrollbar-thin scrollbar-thumb-white/10"
      >
        {!engine.historyLoaded && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
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

          // Time separator
          let timeSeparator: React.ReactNode = null;
          if (idx > 0 && !isReplyEvent) {
            timeSeparator = renderTimeSeparator(event, engine.events[idx - 1]);
          }

          const replies = engine.threadMap.get(event.id) || [];

          return (
            <div key={event.id}>
              {timeSeparator}
              <StreamEventRouter event={event} onReply={engine.handleReply} />
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
  );
}

// ---------------------------------------------------------------------------
// Time separator helper
// ---------------------------------------------------------------------------

function renderTimeSeparator(
  event: StreamEvent,
  prev: StreamEvent,
): React.ReactNode {
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
      <div className="flex-1 h-px bg-border/50" />
      <span className="text-[10px] text-muted-foreground/50">{label}</span>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  );
}
