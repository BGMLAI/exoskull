"use client";

/**
 * BirthChat — Unified IORS birth flow (voice + text) for web onboarding.
 *
 * Combines text chat with dictation (mic button) and optional TTS.
 * Uses the full processUserMessage pipeline (30+ tools)
 * via /api/onboarding/birth-chat.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DictationButton } from "@/components/ui/DictationButton";
import {
  Send,
  Loader2,
  MessageSquare,
  Volume2,
  VolumeX,
  Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDictation } from "@/lib/hooks/useDictation";
import { useTTS } from "@/lib/hooks/useTTS";
import { BIRTH_FIRST_MESSAGE } from "@/lib/iors/birth-prompt";

const ESTIMATED_STEPS = 15;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function MessageSkeleton() {
  return (
    <div className="flex justify-start animate-pulse">
      <div className="max-w-[80%] space-y-2 rounded-2xl px-4 py-3 bg-muted">
        <div className="h-3 w-48 bg-muted-foreground/20 rounded" />
        <div className="h-3 w-36 bg-muted-foreground/20 rounded" />
        <div className="h-3 w-24 bg-muted-foreground/20 rounded" />
      </div>
    </div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.min((current / total) * 100, 100);
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        Krok {current} z ~{total}
      </span>
    </div>
  );
}

export function BirthChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const greetingPlayedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // TTS hook
  const { isTTSEnabled, isSpeaking, toggleTTS, playAudio, stopAudio } =
    useTTS();

  // Ref to sendMessageDirect so dictation can auto-send
  const sendMessageDirectRef = useRef<(text: string) => void>(() => {});

  // Dictation hook — auto-sends after transcription (like voice mode)
  const { isListening, isSupported, interimTranscript, toggleListening } =
    useDictation({
      onFinalTranscript: (text) => {
        sendMessageDirectRef.current(text);
      },
      onError: (error) => {
        setDictationError(error);
        setTimeout(() => setDictationError(null), 3000);
      },
    });

  // Progress: count user messages
  const userMessageCount = messages.filter((m) => m.role === "user").length;

  // Show initial greeting after a brief skeleton
  useEffect(() => {
    const timer = setTimeout(() => {
      setMessages([
        {
          id: "greeting",
          role: "assistant",
          content: BIRTH_FIRST_MESSAGE,
        },
      ]);
      setIsInitialized(true);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Play TTS greeting on mount (if TTS enabled)
  useEffect(() => {
    if (greetingPlayedRef.current) return;
    greetingPlayedRef.current = true;

    // Delay slightly to check localStorage-loaded TTS preference
    const timer = setTimeout(async () => {
      // Re-read from localStorage directly since state may not be settled
      const stored = localStorage.getItem("exoskull-tts-enabled");
      const ttsOn = stored === null || stored === "true";
      if (!ttsOn) return;

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
    }, 700);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------------------------------------------------------------------------
  // SEND MESSAGE
  // --------------------------------------------------------------------------

  // Direct send (used by dictation auto-send and manual send)
  const sendMessageDirect = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      // Stop any current audio before sending
      stopAudio();

      const userText = text.trim();
      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: userText,
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsLoading(true);

      try {
        const response = await fetch("/api/onboarding/birth-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userText,
            generateAudio: isTTSEnabled,
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
          // Play final audio, then redirect
          if (data.audio && isTTSEnabled) {
            // Play audio, redirect after it ends
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
            audio.play().catch(() => {
              window.location.href = "/dashboard";
            });
          } else {
            setTimeout(() => {
              window.location.href = "/dashboard";
            }, 2000);
          }
          return;
        }

        // Play TTS for non-final responses
        if (data.audio && isTTSEnabled) {
          playAudio(data.audio);
        }
      } catch (err) {
        console.error("[BirthChat] Send error:", err);
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "assistant",
            content:
              "Przepraszam, cos poszlo nie tak. Napisz jeszcze raz -- chce Cie poznac!",
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, isTTSEnabled, playAudio, stopAudio],
  );

  // Keep ref updated for dictation auto-send
  sendMessageDirectRef.current = sendMessageDirect;

  // Wrapper for manual send (from button / Enter key)
  const sendMessage = useCallback(() => {
    sendMessageDirect(input);
  }, [input, sendMessageDirect]);

  // File upload handler
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsUploading(true);

      try {
        const type = file.type.toLowerCase();
        const category = type.startsWith("image/")
          ? "photos"
          : type.includes("pdf") || type.includes("document")
            ? "documents"
            : "other";

        // Step 1: Get signed upload URL
        const urlRes = await fetch("/api/knowledge/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            fileSize: file.size,
            category,
          }),
        });

        if (!urlRes.ok) {
          const errData = await urlRes.json().catch(() => ({}));
          throw new Error(
            errData.error || `Upload URL failed: ${urlRes.status}`,
          );
        }
        const { signedUrl, documentId, mimeType } = await urlRes.json();

        // Step 2: Upload directly to Supabase Storage
        // Use server-provided mimeType (matches bucket whitelist exactly)
        const uploadRes = await fetch(signedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": mimeType || file.type,
            "x-upsert": "true",
          },
          body: file,
        });

        if (!uploadRes.ok)
          throw new Error(`Storage upload failed: ${uploadRes.status}`);

        // Step 3: Confirm upload and trigger processing
        await fetch("/api/knowledge/confirm-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId }),
        });

        // Auto-send message so IORS knows about the file
        sendMessageDirect(
          `Przeslalem plik "${file.name}" (typ: ${file.type}, kategoria: ${category}, id: ${documentId}). Skataloguj go.`,
        );
      } catch (err) {
        console.error("[BirthChat] Upload error:", err);
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: `Blad przesylania pliku: ${err instanceof Error ? err.message : "Nieznany blad"}`,
          },
        ]);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [sendMessageDirect],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <Card className="w-full max-w-2xl bg-card border-border">
      <CardHeader className="pb-2 flex flex-col gap-0 border-b border-border">
        <div className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg text-foreground flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Rozmowa z IORS
          </CardTitle>

          {/* TTS toggle */}
          <button
            onClick={toggleTTS}
            className={cn(
              "p-2 rounded-full transition-colors",
              isTTSEnabled
                ? "bg-primary/20 text-primary hover:bg-primary/30"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
            title={isTTSEnabled ? "Wycisz glos" : "Wlacz glos"}
            aria-label={isTTSEnabled ? "Wycisz glos" : "Wlacz glos"}
          >
            {isTTSEnabled ? (
              <Volume2
                className={cn("h-5 w-5", isSpeaking && "animate-pulse")}
              />
            ) : (
              <VolumeX className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Progress bar */}
        {isInitialized && (
          <ProgressBar current={userMessageCount} total={ESTIMATED_STEPS} />
        )}
      </CardHeader>

      <CardContent className="flex flex-col h-[500px] p-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Skeleton before first message loads */}
          {!isInitialized && <MessageSkeleton />}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex animate-in fade-in duration-300",
                msg.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start animate-in fade-in duration-200">
              <div className="bg-muted rounded-2xl px-4 py-2">
                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Speaking indicator */}
        {isSpeaking && (
          <div className="px-4 py-2 bg-primary/10 border-t border-border">
            <button
              onClick={stopAudio}
              className="flex items-center gap-2 text-sm text-primary hover:text-primary/80"
            >
              <Volume2 className="w-4 h-4 animate-pulse" />
              IORS mowi... kliknij aby przerwac
            </button>
          </div>
        )}

        {/* Dictation interim transcript */}
        {interimTranscript && isListening && (
          <div className="px-4 py-2 bg-muted/50 border-t border-border">
            <p className="text-sm text-foreground italic">
              {interimTranscript}
            </p>
          </div>
        )}

        {/* Dictation error */}
        {dictationError && (
          <div className="px-4 py-2 bg-destructive/10 border-t border-border">
            <p className="text-sm text-destructive">{dictationError}</p>
          </div>
        )}

        {/* Input bar */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2 items-center">
            <DictationButton
              isListening={isListening}
              isSupported={isSupported}
              onClick={toggleListening}
              disabled={isLoading || isSpeaking}
              size="sm"
            />
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              accept=".pdf,.txt,.md,.json,.csv,.docx,.xlsx,.pptx,.doc,.xls,.ppt,.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isUploading}
              className="p-2 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
              title="Przeslij plik"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Napisz, dyktuj lub przeslij plik..."
              disabled={isLoading}
              className="flex-1 bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="bg-primary hover:bg-primary/90"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
