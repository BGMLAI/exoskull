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
// HOOK — MediaRecorder → OpenAI/Groq Whisper (/api/voice/transcribe)
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
  const recordStartRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hadAudioRef = useRef(false);
  const silenceStartRef = useRef<number | null>(null);
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  const onErrorRef = useRef(onError);

  const SILENCE_TIMEOUT_MS = 1500; // 1.5 seconds silence → auto-stop
  const MAX_RECORDING_MS = 120_000; // 2 min safety limit

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
      if (levelIntervalRef.current) clearInterval(levelIntervalRef.current);
      audioContextRef.current?.close().catch(() => {});
    };
  }, []);

  // --------------------------------------------------------------------------
  // Audio level monitoring (detect silent mic)
  // --------------------------------------------------------------------------

  const startLevelMonitor = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      hadAudioRef.current = false;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      silenceStartRef.current = null;

      levelIntervalRef.current = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        // Max recording duration safety
        const elapsed = Date.now() - recordStartRef.current;
        if (elapsed >= MAX_RECORDING_MS) {
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
          }
          return;
        }

        if (avg > 5) {
          hadAudioRef.current = true;
          silenceStartRef.current = null; // Reset silence timer
          setInterimTranscript("Nagrywam... 🎤");
        } else if (hadAudioRef.current) {
          // Had audio before, now silent → start auto-stop countdown
          if (!silenceStartRef.current) {
            silenceStartRef.current = Date.now();
          }
          const silentFor = Date.now() - silenceStartRef.current;
          if (silentFor >= SILENCE_TIMEOUT_MS) {
            // Auto-stop after 5s silence
            if (mediaRecorderRef.current?.state === "recording") {
              mediaRecorderRef.current.stop();
            }
            return;
          }
          const remaining = Math.ceil((SILENCE_TIMEOUT_MS - silentFor) / 1000);
          setInterimTranscript(`Cisza... auto-wysyłka za ${remaining}s`);
        } else if (!hadAudioRef.current) {
          setInterimTranscript(
            "🔇 Mikrofon nie łapie dźwięku — sprawdź ustawienia",
          );
        }
      }, 300);
    } catch {
      // AudioContext not available — skip level monitoring
    }
  }, []);

  const stopLevelMonitor = useCallback(() => {
    if (levelIntervalRef.current) {
      clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    analyserRef.current = null;
  }, []);

  // --------------------------------------------------------------------------
  // Transcribe via Whisper (OpenAI primary, Groq fallback)
  // --------------------------------------------------------------------------

  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    setInterimTranscript(
      `Przetwarzam... (${Math.round(audioBlob.size / 1024)}KB)`,
    );
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
        onErrorRef.current?.(
          hadAudioRef.current
            ? "Nie rozpoznano mowy. Mów wyraźniej i bliżej mikrofonu."
            : "Mikrofon nie nagrał dźwięku. Sprawdź: Windows Settings → Privacy → Microphone",
        );
        return;
      }

      onFinalTranscriptRef.current?.(transcript.trim());
    } catch (err) {
      console.error("[useDictation] Transcription failed:", err);
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

      // Start audio level monitoring
      startLevelMonitor(stream);

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
        stopLevelMonitor();
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const duration = Date.now() - recordStartRef.current;
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });

        console.log("[useDictation] Recording stopped:", {
          duration: `${duration}ms`,
          blobSize: `${audioBlob.size} bytes`,
          chunks: chunksRef.current.length,
          hadAudio: hadAudioRef.current,
        });

        // Require at least 1s of recording
        if (duration < 1000 || audioBlob.size < 1000) {
          onErrorRef.current?.(
            `Za krótkie nagranie (${Math.round(duration / 1000)}s, ${Math.round(audioBlob.size / 1024)}KB). Mów dłużej.`,
          );
          setIsListening(false);
          setInterimTranscript("");
          return;
        }

        // Warn if no audio detected but still try
        if (!hadAudioRef.current) {
          console.warn(
            "[useDictation] No audio detected during recording — mic may be muted",
          );
        }

        transcribeAudio(audioBlob);
      };

      mediaRecorder.start(250);
      recordStartRef.current = Date.now();
      setIsListening(true);
      setInterimTranscript("Nagrywam...");
    } catch (err) {
      console.error("[useDictation] getUserMedia failed:", err);
      onErrorRef.current?.(
        "Brak dostępu do mikrofonu. Sprawdź ustawienia przeglądarki.",
      );
      setIsListening(false);
    }
  }, [transcribeAudio, startLevelMonitor, stopLevelMonitor]);

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
