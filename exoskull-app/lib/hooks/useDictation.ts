"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// ============================================================================
// TYPES
// ============================================================================

interface UseDictationOptions {
  onFinalTranscript?: (text: string) => void;
  onError?: (error: string) => void;
}

interface UseDictationReturn {
  isListening: boolean;
  isSupported: boolean;
  interimTranscript: string;
  toggleListening: () => void;
}

// ============================================================================
// HOOK — Always uses MediaRecorder → Groq Whisper (/api/voice/transcribe)
// ============================================================================

export function useDictation(
  options: UseDictationOptions = {},
): UseDictationReturn {
  const { onFinalTranscript, onError } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  const onErrorRef = useRef(onError);

  // Keep refs fresh to avoid stale closures
  onFinalTranscriptRef.current = onFinalTranscript;
  onErrorRef.current = onError;

  // Check mic support on mount
  useEffect(() => {
    const hasMic = typeof navigator !== "undefined" && !!navigator.mediaDevices;
    setIsSupported(hasMic);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // --------------------------------------------------------------------------
  // Transcribe via Groq Whisper
  // --------------------------------------------------------------------------

  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    setInterimTranscript("Przetwarzam...");
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.webm");

      const response = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          errData.error || `Transcription error: ${response.status}`,
        );
      }

      const { transcript } = await response.json();

      if (!transcript?.trim()) {
        onErrorRef.current?.("Nie wykryto mowy. Spróbuj ponownie.");
        return;
      }

      onFinalTranscriptRef.current?.(transcript.trim());
    } catch (err) {
      console.error("[useDictation] Groq transcription failed:", err);
      onErrorRef.current?.(
        err instanceof Error ? err.message : "Błąd transkrypcji",
      );
    } finally {
      setInterimTranscript("");
      setIsListening(false);
    }
  }, []);

  // --------------------------------------------------------------------------
  // Start / Stop recording
  // --------------------------------------------------------------------------

  const startRecording = useCallback(async () => {
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (audioBlob.size > 0) {
          transcribeAudio(audioBlob);
        } else {
          setIsListening(false);
          setInterimTranscript("");
        }
      };

      mediaRecorder.start(250);
      setIsListening(true);
      setInterimTranscript("Nagrywam...");
    } catch {
      onErrorRef.current?.(
        "Brak dostępu do mikrofonu. Sprawdź ustawienia przeglądarki.",
      );
      setIsListening(false);
    }
  }, [transcribeAudio]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // --------------------------------------------------------------------------
  // Toggle
  // --------------------------------------------------------------------------

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isListening, startRecording, stopRecording]);

  return {
    isListening,
    isSupported,
    interimTranscript,
    toggleListening,
  };
}
