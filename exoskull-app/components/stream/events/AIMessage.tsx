"use client";

import { useCallback, useRef, useEffect } from "react";
import { Volume2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/components/ui/markdown-content";
import type { StreamEvent, AIMessageData } from "@/lib/stream/types";

interface AIMessageProps {
  event: StreamEvent;
}

export function AIMessage({ event }: AIMessageProps) {
  const data = event.data as AIMessageData;
  const polishVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // Find best Polish voice on mount
  useEffect(() => {
    function pickVoice() {
      const voices = window.speechSynthesis?.getVoices() || [];
      const polish = voices.filter(
        (v) => v.lang === "pl-PL" || v.lang.startsWith("pl"),
      );
      polishVoiceRef.current =
        polish.find((v) => v.name.includes("Google")) ||
        polish.find((v) => !v.localService) ||
        polish[0] ||
        null;
    }
    pickVoice();
    window.speechSynthesis?.addEventListener("voiceschanged", pickVoice);
    return () => {
      window.speechSynthesis?.removeEventListener("voiceschanged", pickVoice);
    };
  }, []);

  const speakText = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    const clean = text
      .replace(/[*_~`#>\[\]()!|]/g, "")
      .replace(/\n+/g, ". ")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "pl-PL";
    utterance.rate = 1.25;
    if (polishVoiceRef.current) utterance.voice = polishVoiceRef.current;
    window.speechSynthesis.speak(utterance);
  }, []);

  const isEmpty = !data.content;

  return (
    <div className="flex justify-start animate-in fade-in slide-in-from-left-2 duration-200">
      <div
        className={cn(
          "rounded-2xl px-4 py-2.5 max-w-[80%]",
          "bg-muted text-foreground",
        )}
      >
        {data.isStreaming && isEmpty ? (
          <div className="flex items-center gap-1 py-1">
            <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
        ) : (
          <>
            <MarkdownContent content={data.content} />
            {!data.isStreaming && data.content && (
              <button
                onClick={() => speakText(data.content)}
                className="mt-1 p-1 rounded hover:bg-background/20 transition-colors inline-flex items-center gap-1 text-xs opacity-50 hover:opacity-100"
                title="Odczytaj na glos"
              >
                <Volume2 className="w-3 h-3" />
              </button>
            )}
          </>
        )}
        {!data.isStreaming && data.toolsUsed && data.toolsUsed.length > 0 && (
          <span className="text-xs opacity-60 mt-1 block">
            Uzyto: {data.toolsUsed.join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}
