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
  continuous: boolean;
  toggleListening: () => void;
  setContinuous: (on: boolean) => void;
  startListening: () => void;
  stopListening: () => void;
}

// ============================================================================
// HOOK — MediaRecorder → OpenAI/Groq Whisper (/api/voice/transcribe)
// Supports continuous mode: auto-restart after transcription.
// ============================================================================

export function useDictation(
  options: UseDictationOptions = {},
): UseDictationReturn {
  const { onFinalTranscript, onError } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [continuous, setContinuousState] = useState(false);

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
  const continuousRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const SILENCE_TIMEOUT_MS = 1500;
  const MAX_RECORDING_MS = 120_000;
  const RESTART_DELAY_MS = 300; // brief pause between segments in continuous mode

  // Keep refs fresh
  onFinalTranscriptRef.current = onFinalTranscript;
  onErrorRef.current = onError;

  const setContinuous = useCallback((on: boolean) => {
    setContinuousState(on);
    continuousRef.current = on;
  }, []);

  useEffect(() => {
    const hasMic = typeof navigator !== "undefined" && !!navigator.mediaDevices;
    setIsSupported(hasMic);
  }, []);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (levelIntervalRef.current) clearInterval(levelIntervalRef.current);
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      audioContextRef.current?.close().catch(() => {});
    };
  }, []);

  // --------------------------------------------------------------------------
  // Audio level monitoring
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

        const elapsed = Date.now() - recordStartRef.current;
        if (elapsed >= MAX_RECORDING_MS) {
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
          }
          return;
        }

        if (avg > 5) {
          hadAudioRef.current = true;
          silenceStartRef.current = null;
          setInterimTranscript("Nagrywam...");
        } else if (hadAudioRef.current) {
          if (!silenceStartRef.current) {
            silenceStartRef.current = Date.now();
          }
          const silentFor = Date.now() - silenceStartRef.current;
          if (silentFor >= SILENCE_TIMEOUT_MS) {
            if (mediaRecorderRef.current?.state === "recording") {
              mediaRecorderRef.current.stop();
            }
            return;
          }
          const remaining = Math.ceil((SILENCE_TIMEOUT_MS - silentFor) / 1000);
          setInterimTranscript(`Cisza... auto-wysylka za ${remaining}s`);
        } else if (!hadAudioRef.current) {
          setInterimTranscript("Mikrofon nie lapie dzwieku");
        }
      }, 300);
    } catch {
      // AudioContext not available
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
  // Transcribe
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
            ? "Nie rozpoznano mowy. Mow wyrazniej."
            : "Mikrofon nie nagral dzwieku.",
        );
        return;
      }

      onFinalTranscriptRef.current?.(transcript.trim());
    } catch (err) {
      console.error("[useDictation] Transcription failed:", err);
      onErrorRef.current?.(
        err instanceof Error ? err.message : "Blad transkrypcji",
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
      startLevelMonitor(stream);

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : undefined;
      const mediaRecorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stopLevelMonitor();
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const duration = Date.now() - recordStartRef.current;
        const audioBlob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });

        if (duration < 1000 || audioBlob.size < 1000) {
          // Too short — in continuous mode, just restart
          if (continuousRef.current) {
            setInterimTranscript("Slucham...");
            restartTimerRef.current = setTimeout(() => {
              startRecording();
            }, RESTART_DELAY_MS);
          } else {
            onErrorRef.current?.(
              `Za krotkie nagranie (${Math.round(duration / 1000)}s). Mow dluzej.`,
            );
            setIsListening(false);
            setInterimTranscript("");
          }
          return;
        }

        // Transcribe, then restart if continuous
        transcribeAudio(audioBlob).finally(() => {
          if (continuousRef.current) {
            setInterimTranscript("Slucham...");
            restartTimerRef.current = setTimeout(() => {
              startRecording();
            }, RESTART_DELAY_MS);
          }
        });
      };

      mediaRecorder.start(250);
      recordStartRef.current = Date.now();
      setIsListening(true);
      setInterimTranscript(
        continuousRef.current ? "Slucham..." : "Nagrywam...",
      );
    } catch (err) {
      console.error("[useDictation] getUserMedia failed:", err);
      onErrorRef.current?.(
        "Brak dostepu do mikrofonu. Sprawdz ustawienia przegladarki.",
      );
      setIsListening(false);
    }
  }, [transcribeAudio, startLevelMonitor, stopLevelMonitor]);

  const stopRecording = useCallback(() => {
    // Cancel any pending restart
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    // Disable continuous so onstop doesn't restart
    continuousRef.current = false;
    setContinuousState(false);

    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  const startListening = useCallback(() => {
    if (!isListening) startRecording();
  }, [isListening, startRecording]);

  const stopListening = useCallback(() => {
    stopRecording();
  }, [stopRecording]);

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
    continuous,
    toggleListening,
    setContinuous,
    startListening,
    stopListening,
  };
}
