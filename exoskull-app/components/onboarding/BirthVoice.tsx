"use client";

/**
 * BirthVoice — Voice-based IORS birth flow for web onboarding.
 *
 * Mic → Groq Whisper STT → Claude + birth prefix (30+ tools) → ElevenLabs TTS.
 * Full-screen layout with large mic button + transcript history.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Mic, MicOff, Loader2, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BIRTH_FIRST_MESSAGE } from "@/lib/iors/birth-prompt";

type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface BirthVoiceProps {
  onBack: () => void;
}

export function BirthVoice({ onBack }: BirthVoiceProps) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "greeting",
      role: "assistant",
      content: BIRTH_FIRST_MESSAGE,
    },
  ]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const greetingPlayedRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      audioRef.current?.pause();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Play TTS greeting on mount
  useEffect(() => {
    if (greetingPlayedRef.current) return;
    greetingPlayedRef.current = true;

    (async () => {
      try {
        const response = await fetch("/api/onboarding/birth-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "__birth_greeting__",
            generateAudio: true,
          }),
        });

        if (!response.ok) return;
        const data = await response.json();

        if (data.audio) {
          // Update greeting text if API returned different text
          if (data.text && data.text !== BIRTH_FIRST_MESSAGE) {
            setMessages([
              { id: "greeting", role: "assistant", content: data.text },
            ]);
          }
          playAudio(data.audio);
        }
      } catch {
        // Greeting audio failed — text greeting is still visible
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================================
  // AUDIO PLAYBACK
  // ============================================================================

  const playAudio = useCallback((audioBase64: string) => {
    try {
      setState("speaking");
      const audioBytes = Uint8Array.from(atob(audioBase64), (c) =>
        c.charCodeAt(0),
      );
      const audioBlob = new Blob([audioBytes], { type: "audio/mpeg" });
      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setState("idle");
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        setState("idle");
      };
      audio.play();
    } catch (err) {
      console.error("[BirthVoice] Audio playback failed:", err);
      setState("idle");
    }
  }, []);

  // ============================================================================
  // SEND MESSAGE (after transcription)
  // ============================================================================

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        setState("idle");
        return;
      }

      setState("processing");

      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text.trim(),
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        const response = await fetch("/api/onboarding/birth-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text.trim(),
            generateAudio: true,
          }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        const assistantMsg: Message = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.text,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        if (data.isComplete) {
          // Play final audio then redirect
          if (data.audio) {
            const audioBytes = Uint8Array.from(atob(data.audio), (c) =>
              c.charCodeAt(0),
            );
            const audioBlob = new Blob([audioBytes], { type: "audio/mpeg" });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.onended = () => {
              URL.revokeObjectURL(audioUrl);
              window.location.href = "/dashboard";
            };
            audio.onerror = () => {
              URL.revokeObjectURL(audioUrl);
              window.location.href = "/dashboard";
            };
            setState("speaking");
            audio.play();
          } else {
            setTimeout(() => {
              window.location.href = "/dashboard";
            }, 2000);
          }
          return;
        }

        if (data.audio) {
          playAudio(data.audio);
        } else {
          setState("idle");
        }
      } catch (err) {
        console.error("[BirthVoice] Send error:", err);
        setError("Nie udało się przetworzyć. Spróbuj ponownie.");
        setState("error");
        setTimeout(() => {
          setError(null);
          setState("idle");
        }, 3000);
      }
    },
    [playAudio],
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

        await sendMessage(transcript);
      } catch (err) {
        console.error("[BirthVoice] Transcription failed:", err);
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
          setState("idle");
        }
      };

      mediaRecorder.start(250);
      setState("listening");
    } catch {
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
    audioRef.current?.pause();
    setState("idle");
  }, []);

  const handleMicClick = useCallback(() => {
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
  // STATE CONFIG
  // ============================================================================

  const stateConfig = {
    idle: {
      icon: <Mic className="w-10 h-10" />,
      color: "bg-blue-600 hover:bg-blue-700",
      pulse: false,
      label: "Kliknij aby mówić",
    },
    listening: {
      icon: <MicOff className="w-10 h-10" />,
      color: "bg-red-500 hover:bg-red-600",
      pulse: true,
      label: "Słucham... kliknij aby wysłać",
    },
    processing: {
      icon: <Loader2 className="w-10 h-10 animate-spin" />,
      color: "bg-yellow-500",
      pulse: false,
      label: "Przetwarzam...",
    },
    speaking: {
      icon: <Volume2 className="w-10 h-10" />,
      color: "bg-green-500 hover:bg-green-600",
      pulse: true,
      label: "IORS mówi... kliknij aby przerwać",
    },
    error: {
      icon: <Mic className="w-10 h-10" />,
      color: "bg-red-700",
      pulse: false,
      label: "Błąd — kliknij aby spróbować ponownie",
    },
  };

  const config = stateConfig[state];

  return (
    <Card className="w-full max-w-2xl bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-2 flex flex-row items-center border-b border-slate-700">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <CardTitle className="text-lg text-white flex items-center gap-2">
          <Mic className="h-5 w-5 text-blue-400" />
          Rozmowa głosowa z IORS
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col h-[500px] p-0">
        {/* Transcript history */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2",
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-700 text-slate-100",
                )}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}

          {state === "processing" && (
            <div className="flex justify-start">
              <div className="bg-slate-700 rounded-2xl px-4 py-2">
                <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Mic button + status */}
        <div className="p-6 border-t border-slate-700 flex flex-col items-center gap-3">
          {error && (
            <div className="bg-red-900/80 rounded-lg px-3 py-2 text-sm text-red-200 max-w-xs text-center">
              {error}
            </div>
          )}

          <button
            onClick={handleMicClick}
            disabled={state === "processing"}
            className={`
              ${config.color}
              text-white rounded-full w-20 h-20 flex items-center justify-center
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

          <p className="text-sm text-slate-400">{config.label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
