"use client";

import { useState, useCallback, useRef } from "react";
import { Mic, MicOff, Loader2, Phone } from "lucide-react";
import { useDictation } from "@/lib/hooks/useDictation";
import { cn } from "@/lib/utils";

interface FloatingMicFABProps {
  onCallStart?: () => void;
}

/**
 * FloatingMicFAB — 64px fixed button, bottom-right.
 *
 * Modes:
 * - Tap: single recording (tap to start, auto-stop on silence)
 * - Long-press (600ms): start voice call mode (full-screen overlay)
 * - Double-tap: toggle continuous conversation mode
 */
export function FloatingMicFAB({ onCallStart }: FloatingMicFABProps) {
  const [error, setError] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const {
    isListening,
    isSupported,
    interimTranscript,
    continuous,
    toggleListening,
    setContinuous,
    startListening,
    stopListening,
  } = useDictation({
    onFinalTranscript: (text) => {
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

  const isProcessing = !isListening && !!interimTranscript && !continuous;

  // Long-press to open voice call
  const handlePointerDown = useCallback(() => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      onCallStart?.();
    }, 600);
  }, [onCallStart]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Tap handler
  const handleClick = useCallback(() => {
    if (longPressTriggered.current) return; // long-press, skip
    if (continuous) {
      stopListening();
    } else {
      toggleListening();
    }
    setError(null);
  }, [continuous, stopListening, toggleListening]);

  // Double-tap to toggle continuous mode
  const lastTapRef = useRef(0);
  const handleDoubleCheck = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double-tap
      if (!continuous) {
        setContinuous(true);
        if (!isListening) startListening();
      } else {
        stopListening();
      }
      lastTapRef.current = 0;
      return true;
    }
    lastTapRef.current = now;
    return false;
  }, [continuous, isListening, setContinuous, startListening, stopListening]);

  const handleTap = useCallback(() => {
    if (longPressTriggered.current) return;
    if (!handleDoubleCheck()) {
      // Single tap — delay to check for double-tap
      setTimeout(() => {
        if (Date.now() - lastTapRef.current >= 280) {
          handleClick();
        }
      }, 310);
    }
  }, [handleClick, handleDoubleCheck]);

  if (!isSupported) return null;

  return (
    <>
      {/* Error tooltip */}
      {error && (
        <div className="fixed bottom-36 right-6 md:bottom-24 md:right-8 z-30 max-w-[240px] bg-destructive text-destructive-foreground text-xs px-3 py-2 rounded-lg shadow-lg">
          {error}
        </div>
      )}

      {/* Status indicator */}
      {interimTranscript && (
        <div className="fixed bottom-36 right-6 md:bottom-24 md:right-8 z-30 max-w-[240px] bg-card text-foreground text-xs px-3 py-2 rounded-lg shadow-lg border">
          {continuous && (
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5 animate-pulse" />
          )}
          {interimTranscript}
        </div>
      )}

      {/* Continuous mode badge */}
      {continuous && !isListening && !interimTranscript && (
        <div className="fixed bottom-36 right-6 md:bottom-24 md:right-8 z-30 bg-green-600 text-white text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          Tryb rozmowy
        </div>
      )}

      {/* Call hint */}
      {!isListening && !continuous && !isProcessing && (
        <div className="fixed bottom-20 right-24 md:bottom-8 md:right-28 z-30 hidden sm:flex items-center gap-1.5 text-muted-foreground text-[10px] opacity-60">
          <Phone className="w-3 h-3" />
          Przytrzymaj = rozmowa
        </div>
      )}

      {/* FAB Button */}
      <button
        onClick={handleTap}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        disabled={isProcessing}
        className={cn(
          "fixed bottom-20 right-6 md:bottom-8 md:right-8 z-30",
          "w-16 h-16 rounded-full shadow-lg",
          "flex items-center justify-center",
          "transition-all duration-200",
          "hover:shadow-xl hover:scale-105 active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          continuous
            ? "bg-green-600 text-white"
            : isListening
              ? "bg-destructive text-destructive-foreground"
              : isProcessing
                ? "bg-muted text-muted-foreground cursor-wait"
                : "bg-primary text-primary-foreground",
        )}
        aria-label={
          continuous
            ? "Zatrzymaj tryb rozmowy"
            : isListening
              ? "Zatrzymaj nagrywanie"
              : "Nagrywaj glosowo"
        }
        title={
          continuous
            ? "Tap = zakoncz, przytrzymaj = polaczenie glosowe"
            : "Tap = nagrywaj, 2x tap = tryb ciaglej rozmowy, przytrzymaj = polaczenie"
        }
      >
        {/* Pulsing ring */}
        {isListening && (
          <span
            className={cn(
              "absolute inset-0 rounded-full border-4 animate-ping",
              continuous ? "border-green-400/40" : "border-destructive/40",
            )}
          />
        )}

        {/* Continuous outer ring */}
        {continuous && (
          <span className="absolute -inset-1 rounded-full border-2 border-green-400/60" />
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
