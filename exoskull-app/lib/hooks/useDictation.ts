"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  createSpeechRecognition,
  isWebSpeechSupported,
  type WebSpeechInstance,
} from "@/lib/voice/web-speech";

// ============================================================================
// TYPES
// ============================================================================

interface UseDictationOptions {
  language?: string;
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
// HOOK
// ============================================================================

export function useDictation(
  options: UseDictationOptions = {},
): UseDictationReturn {
  const { language = "pl-PL", onFinalTranscript, onError } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");

  const speechRef = useRef<WebSpeechInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const useGroqFallbackRef = useRef(false);
  const lastInterimRef = useRef("");
  const finalDeliveredRef = useRef(false);

  // Check support on mount
  useEffect(() => {
    const webSpeechOk = isWebSpeechSupported();
    // Groq Whisper fallback always works if mic is available
    const hasMic = typeof navigator !== "undefined" && !!navigator.mediaDevices;
    setIsSupported(webSpeechOk || hasMic);
    useGroqFallbackRef.current = !webSpeechOk && hasMic;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      speechRef.current?.stop();
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // --------------------------------------------------------------------------
  // Web Speech API path
  // --------------------------------------------------------------------------

  const startWebSpeech = useCallback(() => {
    lastInterimRef.current = "";
    finalDeliveredRef.current = false;

    const speech = createSpeechRecognition({
      language,
      continuous: false,
      interimResults: true,
      onResult: (transcript, isFinal) => {
        if (isFinal) {
          finalDeliveredRef.current = true;
          lastInterimRef.current = "";
          setInterimTranscript("");
          setIsListening(false);
          onFinalTranscript?.(transcript);
        } else {
          lastInterimRef.current = transcript;
          setInterimTranscript(transcript);
        }
      },
      onError: (error) => {
        lastInterimRef.current = "";
        setIsListening(false);
        setInterimTranscript("");
        onError?.(error);
      },
      onEnd: () => {
        // If recognition ended without a final result, use last interim
        if (!finalDeliveredRef.current && lastInterimRef.current.trim()) {
          onFinalTranscript?.(lastInterimRef.current.trim());
        }
        lastInterimRef.current = "";
        setIsListening(false);
        setInterimTranscript("");
      },
    });

    speechRef.current = speech;
    speech.start();
    setIsListening(true);
  }, [language, onFinalTranscript, onError]);

  const stopWebSpeech = useCallback(() => {
    speechRef.current?.stop();
    // Don't clear state here — let onEnd/onResult handle it
  }, []);

  // --------------------------------------------------------------------------
  // Groq Whisper fallback path (MediaRecorder → /api/voice/transcribe)
  // --------------------------------------------------------------------------

  const transcribeAudio = useCallback(
    async (audioBlob: Blob) => {
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
          onError?.("Nie wykryto mowy. Spróbuj ponownie.");
          return;
        }

        onFinalTranscript?.(transcript.trim());
      } catch (err) {
        console.error("[useDictation] Groq transcription failed:", err);
        onError?.(err instanceof Error ? err.message : "Błąd transkrypcji");
      } finally {
        setInterimTranscript("");
        setIsListening(false);
      }
    },
    [onFinalTranscript, onError],
  );

  const startGroqRecording = useCallback(async () => {
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
      onError?.("Brak dostępu do mikrofonu. Sprawdź ustawienia przeglądarki.");
      setIsListening(false);
    }
  }, [transcribeAudio, onError]);

  const stopGroqRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // --------------------------------------------------------------------------
  // Toggle (main entry point)
  // --------------------------------------------------------------------------

  const toggleListening = useCallback(() => {
    if (isListening) {
      if (useGroqFallbackRef.current) {
        stopGroqRecording();
      } else {
        stopWebSpeech();
      }
    } else {
      if (useGroqFallbackRef.current) {
        startGroqRecording();
      } else {
        startWebSpeech();
      }
    }
  }, [
    isListening,
    startWebSpeech,
    stopWebSpeech,
    startGroqRecording,
    stopGroqRecording,
  ]);

  return {
    isListening,
    isSupported,
    interimTranscript,
    toggleListening,
  };
}
