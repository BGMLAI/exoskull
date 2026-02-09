"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useDictation } from "@/lib/hooks/useDictation";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VoiceInputBarProps {
  onSendText: (text: string) => void;
  onSendVoice: (transcript: string) => void;
  isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VoiceInputBar({
  onSendText,
  onSendVoice,
  isLoading,
}: VoiceInputBarProps) {
  const [input, setInput] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const polishVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // Dictation hook (MediaRecorder + Whisper)
  const { isListening, isSupported, interimTranscript, toggleListening } =
    useDictation({
      onFinalTranscript: (text) => {
        setDictationError(null);
        onSendVoice(text);
      },
      onError: (err) => {
        setDictationError(err);
        setTimeout(() => setDictationError(null), 4000);
      },
    });

  // TTS preference from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("exoskull-tts-enabled");
      if (stored !== null) setTtsEnabled(stored === "true");
    } catch {
      /* noop */
    }
  }, []);

  // Find best Polish voice
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
      window.speechSynthesis?.cancel();
    };
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  // Handle send
  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;
    onSendText(input.trim());
    setInput("");
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, isLoading, onSendText]);

  // Handle key down
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // TTS toggle
  const toggleTTS = useCallback(() => {
    if (isSpeaking) {
      window.speechSynthesis?.cancel();
      setIsSpeaking(false);
    } else {
      const next = !ttsEnabled;
      setTtsEnabled(next);
      try {
        localStorage.setItem("exoskull-tts-enabled", String(next));
      } catch {
        /* noop */
      }
      if (!next) {
        window.speechSynthesis?.cancel();
        setIsSpeaking(false);
      }
    }
  }, [isSpeaking, ttsEnabled]);

  // Voice recording waveform bars
  const WaveformBars = () => (
    <div className="flex items-center gap-0.5 h-6">
      {[0, 100, 200, 150, 50].map((delay, i) => (
        <div
          key={i}
          className="w-1 bg-destructive rounded-full animate-wave-bar"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );

  return (
    <div className="border-t bg-card">
      {/* Interim transcript / error display */}
      {(interimTranscript || dictationError) && (
        <div className="px-4 py-2 border-b bg-muted/30">
          <p
            className={cn(
              "text-xs",
              dictationError
                ? "text-destructive"
                : "text-muted-foreground italic",
            )}
          >
            {dictationError || interimTranscript}
          </p>
        </div>
      )}

      {/* Input bar */}
      <div className="p-3">
        <div className="flex items-end gap-2">
          {/* TTS toggle */}
          <button
            onClick={toggleTTS}
            className={cn(
              "p-2.5 rounded-full transition-colors shrink-0",
              isSpeaking
                ? "bg-primary text-primary-foreground animate-pulse"
                : ttsEnabled
                  ? "bg-muted text-foreground hover:bg-accent"
                  : "bg-muted text-muted-foreground hover:bg-accent",
            )}
            title={
              isSpeaking
                ? "Zatrzymaj czytanie"
                : ttsEnabled
                  ? "Wylacz czytanie na glos"
                  : "Wlacz czytanie na glos"
            }
          >
            {ttsEnabled ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </button>

          {/* Text input / waveform */}
          {isListening ? (
            <div className="flex-1 flex items-center justify-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-2.5 min-h-[42px]">
              <WaveformBars />
              <span className="text-sm text-destructive font-medium">
                Nagrywam...
              </span>
              <WaveformBars />
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Napisz wiadomosc..."
              className="flex-1 bg-muted border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent text-sm resize-none min-h-[42px] max-h-[120px]"
              disabled={isLoading}
              rows={1}
            />
          )}

          {/* Mic button */}
          {isSupported && (
            <button
              onClick={toggleListening}
              disabled={isLoading}
              className={cn(
                "p-2.5 rounded-full transition-colors shrink-0",
                isListening
                  ? "bg-destructive text-destructive-foreground animate-pulse"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              title={isListening ? "Zatrzymaj nagrywanie" : "Mow"}
            >
              {isListening ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="p-2.5 bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground text-primary-foreground rounded-full transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
