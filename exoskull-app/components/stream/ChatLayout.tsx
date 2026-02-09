"use client";

import { useState, useCallback } from "react";
import { UnifiedStream } from "./UnifiedStream";
import { ContextPanel } from "./ContextPanel";

export function ChatLayout() {
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("exo-tts-enabled") === "true";
  });

  const toggleTTS = useCallback(() => {
    setTtsEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("exo-tts-enabled", String(next));
      return next;
    });
  }, []);

  return (
    <div className="flex h-full">
      <UnifiedStream className="flex-1" />
      <div className="hidden lg:block">
        <ContextPanel ttsEnabled={ttsEnabled} onToggleTTS={toggleTTS} />
      </div>
    </div>
  );
}
