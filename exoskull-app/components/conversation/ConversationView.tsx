"use client";

import { UnifiedStream } from "@/components/stream/UnifiedStream";
import { FloatingMicFAB } from "./FloatingMicFAB";

/**
 * ConversationView — Wrapper: UnifiedStream + FloatingMicFAB.
 * This is the main content for the dashboard home page.
 */
export function ConversationView() {
  return (
    <div className="relative h-full">
      <UnifiedStream className="h-full" />
      <FloatingMicFAB />
    </div>
  );
}
