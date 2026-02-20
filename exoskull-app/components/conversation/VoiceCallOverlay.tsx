"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Phone, PhoneOff, Mic, Volume2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type CallState = "idle" | "listening" | "processing" | "speaking";

interface VoiceCallOverlayProps {
  open: boolean;
  onClose: () => void;
}

/**
 * VoiceCallOverlay — Full-screen voice call experience.
 *
 * Flow: listen → transcribe → /api/voice/chat → play audio → repeat
 * Uses /api/voice/chat directly (appends to unified thread).
 */
export function VoiceCallOverlay({ open, onClose }: VoiceCallOverlayProps) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [transcript, setTranscript] = useState("");
  const [aiText, setAiText] = useState("");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const activeRef = useRef(false);
  const hadAudioRef = useRef(false);
  const silenceStartRef = useRef<number | null>(null);
  const recordStartRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const callStartRef = useRef<number>(0);

  const SILENCE_TIMEOUT_MS = 1500;
  const MAX_RECORDING_MS = 60_000;

  // Start/stop duration timer
  useEffect(() => {
    if (open && activeRef.current) {
      callStartRef.current = Date.now();
      durationIntervalRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
      }, 1000);
    }
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    };
  }, [open]);

  // Cleanup on unmount or close
  useEffect(() => {
    if (!open) {
      cleanup();
    }
  }, [open]);

  const cleanup = useCallback(() => {
    activeRef.current = false;
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (levelIntervalRef.current) clearInterval(levelIntervalRef.current);
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    setCallState("idle");
    setTranscript("");
    setAiText("");
    setDuration(0);
    setError(null);
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
      silenceStartRef.current = null;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

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
        } else if (hadAudioRef.current) {
          if (!silenceStartRef.current) silenceStartRef.current = Date.now();
          if (Date.now() - silenceStartRef.current >= SILENCE_TIMEOUT_MS) {
            if (mediaRecorderRef.current?.state === "recording") {
              mediaRecorderRef.current.stop();
            }
          }
        }
      }, 200);
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
  // Recording
  // --------------------------------------------------------------------------

  const startRecording = useCallback(async () => {
    if (!activeRef.current) return;
    chunksRef.current = [];
    setCallState("listening");
    setTranscript("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
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

      mediaRecorder.onstop = async () => {
        stopLevelMonitor();
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const dur = Date.now() - recordStartRef.current;
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });

        if (dur < 800 || audioBlob.size < 500) {
          // Too short — restart
          if (activeRef.current) {
            setTimeout(() => startRecording(), 300);
          }
          return;
        }

        await processAudio(audioBlob);
      };

      mediaRecorder.start(250);
      recordStartRef.current = Date.now();
    } catch {
      setError("Brak dostepu do mikrofonu");
      endCall();
    }
  }, [startLevelMonitor, stopLevelMonitor]);

  // --------------------------------------------------------------------------
  // Process: transcribe → chat → play audio → loop
  // --------------------------------------------------------------------------

  const processAudio = useCallback(async (audioBlob: Blob) => {
    if (!activeRef.current) return;
    setCallState("processing");

    try {
      // Step 1: Transcribe
      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.webm");

      const transcribeRes = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!transcribeRes.ok) throw new Error("Transcription failed");
      const { transcript: text } = await transcribeRes.json();

      if (!text?.trim()) {
        // No speech detected — restart
        if (activeRef.current) setTimeout(() => startRecording(), 300);
        return;
      }

      setTranscript(text.trim());

      // Step 2: Chat with audio response
      const chatRes = await fetch("/api/voice/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          generateAudio: true,
        }),
      });

      if (!chatRes.ok) throw new Error("Chat failed");
      const { text: responseText, audio } = await chatRes.json();

      if (!activeRef.current) return;
      setAiText(responseText || "");

      // Step 3: Play audio response
      if (audio) {
        await playAudioResponse(audio);
      }

      // Step 4: Loop — restart recording
      if (activeRef.current) {
        setTimeout(() => startRecording(), 200);
      }
    } catch (err) {
      console.error("[VoiceCall] Process error:", err);
      setError(err instanceof Error ? err.message : "Blad polaczenia");
      // Try to continue despite error
      if (activeRef.current) {
        setTimeout(() => startRecording(), 1000);
      }
    }
  }, []);

  // --------------------------------------------------------------------------
  // Audio playback
  // --------------------------------------------------------------------------

  const playAudioResponse = useCallback(
    (audioBase64: string): Promise<void> => {
      return new Promise((resolve) => {
        if (!activeRef.current) {
          resolve();
          return;
        }

        setCallState("speaking");

        try {
          const audioBytes = Uint8Array.from(atob(audioBase64), (c) =>
            c.charCodeAt(0),
          );
          const blob = new Blob([audioBytes], { type: "audio/mpeg" });
          const url = URL.createObjectURL(blob);
          audioUrlRef.current = url;

          const audio = new Audio(url);
          audioRef.current = audio;

          audio.onended = () => {
            URL.revokeObjectURL(url);
            audioUrlRef.current = null;
            audioRef.current = null;
            setCallState("listening");
            resolve();
          };

          audio.onerror = () => {
            URL.revokeObjectURL(url);
            audioUrlRef.current = null;
            audioRef.current = null;
            resolve();
          };

          audio.play().catch(() => resolve());
        } catch {
          resolve();
        }
      });
    },
    [],
  );

  // --------------------------------------------------------------------------
  // Call lifecycle
  // --------------------------------------------------------------------------

  const startCall = useCallback(() => {
    activeRef.current = true;
    callStartRef.current = Date.now();
    durationIntervalRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
    }, 1000);
    setError(null);
    startRecording();
  }, [startRecording]);

  const endCall = useCallback(() => {
    cleanup();
    onClose();
  }, [cleanup, onClose]);

  // Auto-start on open
  useEffect(() => {
    if (open && callState === "idle" && !activeRef.current) {
      startCall();
    }
  }, [open, callState, startCall]);

  if (!open) return null;

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-slate-900 via-slate-950 to-black flex flex-col items-center justify-center">
      {/* Duration */}
      <p className="text-white/40 text-sm font-mono mb-8">
        {formatTime(duration)}
      </p>

      {/* Status orb */}
      <div className="relative mb-8">
        <div
          className={cn(
            "w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500",
            callState === "listening" &&
              "bg-green-500/20 shadow-[0_0_60px_rgba(34,197,94,0.3)]",
            callState === "processing" &&
              "bg-blue-500/20 shadow-[0_0_60px_rgba(59,130,246,0.3)]",
            callState === "speaking" &&
              "bg-purple-500/20 shadow-[0_0_60px_rgba(168,85,247,0.3)]",
            callState === "idle" && "bg-white/5",
          )}
        >
          {callState === "listening" && (
            <Mic className="w-12 h-12 text-green-400" />
          )}
          {callState === "processing" && (
            <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
          )}
          {callState === "speaking" && (
            <Volume2 className="w-12 h-12 text-purple-400" />
          )}
          {callState === "idle" && (
            <Phone className="w-12 h-12 text-white/30" />
          )}
        </div>

        {/* Pulsing ring for listening */}
        {callState === "listening" && (
          <span className="absolute inset-0 rounded-full border-2 border-green-400/30 animate-ping" />
        )}
        {callState === "speaking" && (
          <span className="absolute inset-0 rounded-full border-2 border-purple-400/30 animate-pulse" />
        )}
      </div>

      {/* Status label */}
      <p className="text-white/60 text-sm mb-4">
        {callState === "listening" && "Slucham..."}
        {callState === "processing" && "Mysle..."}
        {callState === "speaking" && "Mowie..."}
        {callState === "idle" && "Laczenie..."}
      </p>

      {/* Transcript */}
      {transcript && (
        <div className="max-w-sm mx-auto px-6 mb-2">
          <p className="text-white/80 text-center text-sm">
            <span className="text-white/40">Ty: </span>
            {transcript}
          </p>
        </div>
      )}

      {/* AI response */}
      {aiText && (
        <div className="max-w-sm mx-auto px-6 mb-8">
          <p className="text-white/60 text-center text-sm line-clamp-3">
            <span className="text-white/30">IORS: </span>
            {aiText}
          </p>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-red-400 text-xs mb-4">{error}</p>}

      {/* End call button */}
      <button
        onClick={endCall}
        className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-600/30 transition-all hover:scale-105"
        aria-label="Zakoncz rozmowe"
      >
        <PhoneOff className="w-7 h-7" />
      </button>

      <p className="text-white/30 text-xs mt-4">Tap to end call</p>
    </div>
  );
}
