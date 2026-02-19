"use client";

import { useState, useCallback } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { useDictation } from "@/lib/hooks/useDictation";
import { cn } from "@/lib/utils";

/**
 * FloatingMicFAB — 64px fixed button, bottom-right.
 * States: idle, listening (pulsing ring), processing (spinner).
 * Tap to toggle voice recording. Transcription sent as voice message.
 */
export function FloatingMicFAB() {
  const [error, setError] = useState<string | null>(null);

  const { isListening, isSupported, interimTranscript, toggleListening } =
    useDictation({
      onFinalTranscript: (text) => {
        // Dispatch to UnifiedStream via a custom event
        window.dispatchEvent(
          new CustomEvent("exo-voice-message", { detail: { text } }),
        );
        setError(null);
      },
      onError: (err) => {
        setError(err);
        setTimeout(() => setError(null), 4000);
      },
    });

  const isProcessing = !isListening && !!interimTranscript;

  const handleClick = useCallback(() => {
    toggleListening();
    setError(null);
  }, [toggleListening]);

  if (!isSupported) return null;

  return (
    <>
      {/* Error tooltip */}
      {error && (
        <div className="fixed bottom-36 right-6 md:bottom-24 md:right-8 z-30 max-w-[240px] bg-destructive text-destructive-foreground text-xs px-3 py-2 rounded-lg shadow-lg">
          {error}
        </div>
      )}

      {/* Processing transcript indicator */}
      {interimTranscript && !isListening && (
        <div className="fixed bottom-36 right-6 md:bottom-24 md:right-8 z-30 max-w-[240px] bg-card text-foreground text-xs px-3 py-2 rounded-lg shadow-lg border">
          {interimTranscript}
        </div>
      )}

      {/* FAB Button */}
      <button
        onClick={handleClick}
        disabled={isProcessing}
        className={cn(
          "fixed bottom-20 right-6 md:bottom-8 md:right-8 z-30",
          "w-16 h-16 rounded-full shadow-lg",
          "flex items-center justify-center",
          "transition-all duration-200",
          "hover:shadow-xl hover:scale-105",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isListening
            ? "bg-destructive text-destructive-foreground animate-pulse"
            : isProcessing
              ? "bg-muted text-muted-foreground cursor-wait"
              : "bg-primary text-primary-foreground",
        )}
        aria-label={
          isListening
            ? "Zatrzymaj nagrywanie"
            : isProcessing
              ? "Przetwarzam..."
              : "Nagrywaj glosowo"
        }
        title={isListening ? "Zatrzymaj nagrywanie" : "Nagrywaj glosowo"}
      >
        {/* Pulsing ring when listening */}
        {isListening && (
          <span className="absolute inset-0 rounded-full border-4 border-destructive/40 animate-ping" />
        )}

        {isProcessing ? (
          <Loader2 className="w-7 h-7 animate-spin" />
        ) : isListening ? (
          <MicOff className="w-7 h-7 relative z-10" />
        ) : (
          <Mic className="w-7 h-7" />
        )}
      </button>
    </>
  );
}
