"use client";

/**
 * VoiceInterface - Main voice interaction component
 *
 * Uses MediaRecorder + Groq Whisper for STT + Claude for LLM + ElevenLabs for TTS.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Loader2, Volume2, X } from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface VoiceInterfaceProps {
  tenantId: string;
  className?: string;
  position?: "fixed" | "inline";
}

type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function VoiceInterface({
  tenantId,
  className = "",
  position = "fixed",
}: VoiceInterfaceProps) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Emit voice state events for FloatingCallButton audio level ring
  useEffect(() => {
    const isActive = state === "listening" || state === "speaking";
    window.dispatchEvent(
      new CustomEvent("exoskull:voice-state", {
        detail: { active: isActive, state },
      }),
    );
  }, [state]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const polishVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // Pick best Polish voice + cleanup on unmount
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
      mediaRecorderRef.current?.stop();
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ============================================================================
  // AUDIO PLAYBACK (TTS)
  // ============================================================================

  const speakText = useCallback((text: string) => {
    try {
      setState("speaking");
      // Strip markdown for cleaner speech
      const clean = text
        .replace(/[*_~`#>\[\]()!|]/g, "")
        .replace(/\n+/g, ". ")
        .replace(/\s+/g, " ")
        .trim();
      if (!clean) {
        setState("idle");
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = "pl-PL";
      utterance.rate = 1.25;
      utterance.pitch = 0.95;
      if (polishVoiceRef.current) {
        utterance.voice = polishVoiceRef.current;
      }
      utterance.onend = () => setState("idle");
      utterance.onerror = () => setState("idle");
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error("[VoiceInterface] Browser TTS failed:", err);
      setState("idle");
    }
  }, []);

  // ============================================================================
  // SEND TO LLM (after transcription)
  // ============================================================================

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        setState("idle");
        return;
      }

      setState("processing");

      const userMessage: Message = {
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      try {
        // Skip server TTS (generateAudio: false) — use browser speechSynthesis instead
        // This saves ~2s of Cartesia round-trip latency
        const response = await fetch("/api/voice/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text.trim(),
            sessionId,
            generateAudio: false,
          }),
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(
            `API ${response.status}: ${errBody.detail || errBody.error || "unknown"}`,
          );
        }

        const data = await response.json();

        if (data.sessionId) setSessionId(data.sessionId);

        const assistantMessage: Message = {
          role: "assistant",
          content: data.text,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // Instant browser TTS (no server round-trip)
        if (data.text) {
          speakText(data.text);
        } else {
          setState("idle");
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[VoiceInterface] Send error:", errMsg);
        setError(
          errMsg.length > 100 ? "Blad przetwarzania. Sprawdz konsole." : errMsg,
        );
        setState("error");
        setTimeout(() => {
          setError(null);
          setState("idle");
        }, 5000);
      }
    },
    [sessionId, speakText],
  );

  // ============================================================================
  // TRANSCRIBE AUDIO (Groq Whisper)
  // ============================================================================

  const transcribeAudio = useCallback(
    async (audioBlob: Blob) => {
      setState("processing");

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

        if (!transcript || !transcript.trim()) {
          setError("Nie wykryto mowy. Spróbuj ponownie.");
          setState("error");
          setTimeout(() => {
            setError(null);
            setState("idle");
          }, 3000);
          return;
        }

        console.log("[VoiceInterface] Transcribed:", transcript);
        await sendMessage(transcript);
      } catch (err) {
        console.error("[VoiceInterface] Transcription failed:", err);
        setError(err instanceof Error ? err.message : "Błąd transkrypcji");
        setState("error");
        setTimeout(() => {
          setError(null);
          setState("idle");
        }, 3000);
      }
    },
    [sendMessage],
  );

  // ============================================================================
  // START/STOP RECORDING
  // ============================================================================

  const startListening = useCallback(async () => {
    setError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      console.log("[VoiceInterface] Mic access OK");

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
        // Release mic
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (audioBlob.size > 0) {
          transcribeAudio(audioBlob);
        } else {
          setState("idle");
        }
      };

      mediaRecorder.start(250); // collect chunks every 250ms
      setState("listening");
      setIsExpanded(true);
    } catch (micErr) {
      console.error("[VoiceInterface] Mic access failed:", micErr);
      setError(
        "Brak dostępu do mikrofonu. Sprawdź ustawienia systemu i przeglądarki.",
      );
      setState("error");
      setTimeout(() => {
        setError(null);
        setState("idle");
      }, 5000);
    }
  }, [transcribeAudio]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    audioRef.current?.pause();
    setState("idle");
  }, []);

  // ============================================================================
  // HANDLE CLICK
  // ============================================================================

  const handleClick = useCallback(() => {
    switch (state) {
      case "idle":
        startListening();
        break;
      case "listening":
        stopListening();
        break;
      case "speaking":
        stopSpeaking();
        break;
      case "error":
        setState("idle");
        setError(null);
        break;
    }
  }, [state, startListening, stopListening, stopSpeaking]);

  // ============================================================================
  // RENDER
  // ============================================================================

  const stateConfig = {
    idle: {
      icon: <Mic className="w-6 h-6" />,
      color: "bg-blue-600 hover:bg-blue-700",
      pulse: false,
      label: "Mów",
    },
    listening: {
      icon: <MicOff className="w-6 h-6" />,
      color: "bg-red-500 hover:bg-red-600",
      pulse: true,
      label: "Słucham... (kliknij aby zakończyć)",
    },
    processing: {
      icon: <Loader2 className="w-6 h-6 animate-spin" />,
      color: "bg-yellow-500",
      pulse: false,
      label: "Przetwarzam...",
    },
    speaking: {
      icon: <Volume2 className="w-6 h-6" />,
      color: "bg-green-500 hover:bg-green-600",
      pulse: true,
      label: "Mówię...",
    },
    error: {
      icon: <X className="w-6 h-6" />,
      color: "bg-red-700",
      pulse: false,
      label: "Błąd",
    },
  };

  const config = stateConfig[state];

  const buttonClasses =
    position === "fixed" ? "fixed bottom-6 right-6 z-50" : "";

  return (
    <div className={`${buttonClasses} ${className}`}>
      {/* Expanded conversation panel */}
      {isExpanded && messages.length > 0 && (
        <div className="mb-3 bg-slate-800 rounded-xl border border-slate-700 p-4 max-w-sm shadow-xl">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs text-slate-400 font-medium">IORS</span>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-slate-500 hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {messages.slice(-4).map((msg, i) => (
              <div
                key={i}
                className={`text-sm rounded-lg px-3 py-2 ${
                  msg.role === "user"
                    ? "bg-blue-600/20 text-blue-200 ml-4"
                    : "bg-slate-700 text-slate-200 mr-4"
                }`}
              >
                {msg.content}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status indicator while listening */}
      {state === "listening" && (
        <div className="mb-2 bg-red-900/80 rounded-lg px-3 py-2 text-sm text-red-200 max-w-xs animate-pulse">
          Nagrywam... kliknij aby wysłać
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-2 bg-red-900/80 rounded-lg px-3 py-2 text-sm text-red-200 max-w-xs">
          {error}
        </div>
      )}

      {/* Main voice button */}
      <button
        onClick={handleClick}
        disabled={state === "processing"}
        className={`
          ${config.color}
          text-white rounded-full w-14 h-14 flex items-center justify-center
          shadow-lg transition-all duration-200
          ${config.pulse ? "animate-pulse" : ""}
          ${state === "processing" ? "cursor-wait" : "cursor-pointer"}
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
        `}
        title={config.label}
        aria-label={config.label}
      >
        {config.icon}
      </button>
    </div>
  );
}
