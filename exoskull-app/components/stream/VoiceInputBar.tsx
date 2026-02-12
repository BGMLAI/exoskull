"use client";

import { useState, useRef, useCallback, useEffect } from "react";
// TTS state/logic managed by UnifiedStream, VoiceInputBar receives controlled props
import { Send, Mic, MicOff, Volume2, VolumeX, Paperclip } from "lucide-react";
import { useDictation } from "@/lib/hooks/useDictation";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const UPLOAD_ACCEPT =
  ".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.pptx,.ppt,.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov";

interface VoiceInputBarProps {
  onSendText: (text: string) => void;
  onSendVoice: (transcript: string) => void;
  onFileUpload?: (file: File) => void;
  isLoading: boolean;
  /** Controlled TTS state from UnifiedStream */
  ttsEnabled?: boolean;
  isSpeaking?: boolean;
  onToggleTTS?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VoiceInputBar({
  onSendText,
  onSendVoice,
  onFileUpload,
  isLoading,
  ttsEnabled = false,
  isSpeaking = false,
  onToggleTTS,
}: VoiceInputBarProps) {
  const [input, setInput] = useState("");
  const [dictationError, setDictationError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // File picker handler
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      for (let i = 0; i < files.length; i++) {
        onFileUpload?.(files[i]);
      }
      // Reset input so the same file can be selected again
      e.target.value = "";
    },
    [onFileUpload],
  );

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

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Input bar */}
      <div className="p-3">
        <div className="flex items-end gap-2">
          {/* File upload */}
          {onFileUpload && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="p-2.5 rounded-full transition-colors shrink-0 bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Wgraj plik do bazy wiedzy"
            >
              <Paperclip className="w-4 h-4" />
            </button>
          )}

          {/* TTS toggle */}
          <button
            onClick={onToggleTTS}
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
