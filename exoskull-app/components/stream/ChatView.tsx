"use client";

import { UnifiedStream } from "./UnifiedStream";

/**
 * ChatView — Full-height chat wrapper for dashboard pages.
 * Renders UnifiedStream with proper overflow scrolling.
 */
export function ChatView() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <UnifiedStream className="flex-1" />
    </div>
  );
}
