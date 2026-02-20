"use client";

import { useState } from "react";
import { UnifiedStream } from "@/components/stream/UnifiedStream";
import { FloatingMicFAB } from "./FloatingMicFAB";
import { VoiceCallOverlay } from "./VoiceCallOverlay";

/**
 * ConversationView — Wrapper: UnifiedStream + FloatingMicFAB + VoiceCallOverlay.
 * This is the main content for the dashboard home page.
 */
export function ConversationView() {
  const [callOpen, setCallOpen] = useState(false);

  return (
    <div className="relative h-full">
      <UnifiedStream className="h-full" />
      <FloatingMicFAB onCallStart={() => setCallOpen(true)} />
      <VoiceCallOverlay open={callOpen} onClose={() => setCallOpen(false)} />
    </div>
  );
}
