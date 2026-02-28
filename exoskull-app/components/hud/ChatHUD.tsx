"use client";

import { MessageList } from "./MessageList";
import { EnhancedInputBar } from "./EnhancedInputBar";
import { cn } from "@/lib/utils";
import type { UseChatEngineReturn } from "@/lib/hooks/useChatEngine";

interface ChatHUDProps {
  engine: UseChatEngineReturn;
  className?: string;
}

/**
 * ChatHUD — 2D overlay on top of 3D scene.
 *
 * Two widgets:
 * 1. MessageList (scrollable chat stream) — top area
 * 2. EnhancedInputBar (text input) — bottom, always visible
 *
 * Container is pointer-events-none, interactive children are pointer-events-auto.
 */
export function ChatHUD({ engine, className }: ChatHUDProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-10 flex flex-col pointer-events-none",
        className,
      )}
    >
      {/* Chat stream widget */}
      <div className="flex-1 min-h-0 flex flex-col justify-end pointer-events-none">
        <div className="pointer-events-auto max-h-[60vh] overflow-hidden">
          <MessageList engine={engine} />
        </div>
      </div>

      {/* Reply-to strip */}
      {engine.replyTo && (
        <div className="pointer-events-auto mx-4 mb-1">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-t-lg bg-card/80 backdrop-blur-xl border border-b-0 border-white/10">
            <span className="text-[10px] font-medium text-primary">
              {engine.replyTo.senderRole === "user"
                ? "Ty"
                : engine.replyTo.senderRole === "ai"
                  ? "IORS"
                  : "System"}
            </span>
            <p className="text-xs text-muted-foreground truncate flex-1">
              {engine.replyTo.preview}
            </p>
            <button
              onClick={() => engine.setReplyTo(null)}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              x
            </button>
          </div>
        </div>
      )}

      {/* Input widget */}
      <div className="pointer-events-auto mx-4 mb-4">
        <EnhancedInputBar engine={engine} />
      </div>
    </div>
  );
}
