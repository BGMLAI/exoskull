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

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function BirthChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "greeting",
      role: "assistant",
      content: BIRTH_FIRST_MESSAGE,
    },
  ]);
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
    }, 100);

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
              "Przepraszam, coś poszło nie tak. Napisz jeszcze raz — chcę Cię poznać!",
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
        const { signedUrl, documentId } = await urlRes.json();

        // Step 2: Upload directly to Supabase Storage
        const uploadRes = await fetch(signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type, "x-upsert": "true" },
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
          `Przesłałem plik "${file.name}" (typ: ${file.type}, kategoria: ${category}, id: ${documentId}). Skataloguj go.`,
        );
      } catch (err) {
        console.error("[BirthChat] Upload error:", err);
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: `Błąd przesyłania pliku: ${err instanceof Error ? err.message : "Nieznany błąd"}`,
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
    <Card className="w-full max-w-2xl bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-2 flex flex-row items-center justify-between border-b border-slate-700">
        <CardTitle className="text-lg text-white flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-blue-400" />
          Rozmowa z IORS
        </CardTitle>

        {/* TTS toggle */}
        <button
          onClick={toggleTTS}
          className={cn(
            "p-2 rounded-full transition-colors",
            isTTSEnabled
              ? "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
              : "bg-slate-700 text-slate-500 hover:bg-slate-600",
          )}
          title={isTTSEnabled ? "Wycisz głos" : "Włącz głos"}
          aria-label={isTTSEnabled ? "Wycisz głos" : "Włącz głos"}
        >
          {isTTSEnabled ? (
            <Volume2 className={cn("h-5 w-5", isSpeaking && "animate-pulse")} />
          ) : (
            <VolumeX className="h-5 w-5" />
          )}
        </button>
      </CardHeader>

      <CardContent className="flex flex-col h-[500px] p-0">
        {/* Messages */}
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

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-700 rounded-2xl px-4 py-2">
                <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Speaking indicator */}
        {isSpeaking && (
          <div className="px-4 py-2 bg-blue-900/30 border-t border-slate-700">
            <button
              onClick={stopAudio}
              className="flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200"
            >
              <Volume2 className="w-4 h-4 animate-pulse" />
              IORS mówi... kliknij aby przerwać
            </button>
          </div>
        )}

        {/* Dictation interim transcript */}
        {interimTranscript && isListening && (
          <div className="px-4 py-2 bg-slate-700/50 border-t border-slate-600">
            <p className="text-sm text-slate-300 italic">{interimTranscript}</p>
          </div>
        )}

        {/* Dictation error */}
        {dictationError && (
          <div className="px-4 py-2 bg-red-900/30 border-t border-slate-600">
            <p className="text-sm text-red-300">{dictationError}</p>
          </div>
        )}

        {/* Input bar */}
        <div className="p-4 border-t border-slate-700">
          <div className="flex gap-2 items-center">
            <DictationButton
              isListening={isListening}
              isSupported={isSupported}
              onClick={toggleListening}
              disabled={isLoading}
              size="sm"
            />
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              accept=".pdf,.txt,.md,.json,.csv,.docx,.xlsx,.jpg,.jpeg,.png,.webp"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isUploading}
              className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white disabled:opacity-50 transition-colors"
              title="Prześlij plik"
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
              placeholder="Napisz, dyktuj lub prześlij plik..."
              disabled={isLoading}
              className="flex-1 bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
