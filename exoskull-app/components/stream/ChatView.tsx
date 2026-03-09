"use client";

import { UnifiedStream } from "./UnifiedStream";

interface ChatViewProps {
  /** Auto-send this message on mount (K224: chat-driven pages) */
  initialMessage?: string;
}

/**
 * ChatView — Full-height chat wrapper for dashboard pages.
 * Renders UnifiedStream with proper overflow scrolling.
 */
export function ChatView({ initialMessage }: ChatViewProps = {}) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <UnifiedStream className="flex-1" initialMessage={initialMessage} />
    </div>
  );
}
