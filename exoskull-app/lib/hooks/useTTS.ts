"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// ============================================================================
// TYPES
// ============================================================================

interface UseTTSReturn {
  isTTSEnabled: boolean;
  isSpeaking: boolean;
  toggleTTS: () => void;
  playAudio: (audioBase64: string) => void;
  stopAudio: () => void;
}

const STORAGE_KEY = "exoskull-tts-enabled";

// ============================================================================
// HOOK
// ============================================================================

export function useTTS(): UseTTSReturn {
  const [isTTSEnabled, setIsTTSEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Load persisted preference on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        setIsTTSEnabled(stored === "true");
      }
    } catch {
      // localStorage unavailable — keep default (true)
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const toggleTTS = useCallback(() => {
    setIsTTSEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      // Stop current audio when disabling
      if (!next) {
        stopAudio();
      }
      return next;
    });
  }, [stopAudio]);

  const playAudio = useCallback(
    (audioBase64: string) => {
      // Stop any currently playing audio first
      stopAudio();

      try {
        const audioBytes = Uint8Array.from(atob(audioBase64), (c) =>
          c.charCodeAt(0),
        );
        const audioBlob = new Blob([audioBytes], { type: "audio/mpeg" });
        const audioUrl = URL.createObjectURL(audioBlob);
        audioUrlRef.current = audioUrl;

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          audioUrlRef.current = null;
          audioRef.current = null;
          setIsSpeaking(false);
        };

        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          audioUrlRef.current = null;
          audioRef.current = null;
          setIsSpeaking(false);
        };

        setIsSpeaking(true);
        audio.play().catch(() => {
          // Browser autoplay policy blocked — silently degrade
          setIsSpeaking(false);
        });
      } catch (err) {
        console.error("[useTTS] Audio playback failed:", err);
        setIsSpeaking(false);
      }
    },
    [stopAudio],
  );

  return {
    isTTSEnabled,
    isSpeaking,
    toggleTTS,
    playAudio,
    stopAudio,
  };
}
