"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Mic, MicOff, Loader2 } from "lucide-react";
import {
  createSpeechRecognition,
  isWebSpeechSupported,
  type WebSpeechInstance,
} from "@/lib/voice/web-speech";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  type: "text" | "voice_transcript";
  toolsUsed?: string[];
  timestamp: Date;
}

interface ConversationPanelProps {
  className?: string;
  compact?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ConversationPanel({
  className,
  compact,
}: ConversationPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const speechRef = useRef<WebSpeechInstance | null>(null);

  useEffect(() => {
    setIsSpeechSupported(isWebSpeechSupported());
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ============================================================================
  // SEND MESSAGE
  // ============================================================================

  const sendMessage = useCallback(
    async (text: string, type: "text" | "voice_transcript" = "text") => {
      if (!text.trim() || isLoading) return;

      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text.trim(),
        type,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setTranscript("");
      setIsLoading(true);

      const assistantMsgId = `assistant-${Date.now()}`;

      // Add empty assistant message for streaming
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: "assistant",
          content: "",
          type: "text",
          timestamp: new Date(),
        },
      ]);

      try {
        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text.trim(),
            conversationId,
          }),
        });

        if (!res.ok) throw new Error(`API error: ${res.status}`);

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) throw new Error("No response body");

        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "session" && data.conversationId) {
                setConversationId(data.conversationId);
              } else if (data.type === "delta") {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? { ...msg, content: msg.content + data.text }
                      : msg,
                  ),
                );
              } else if (data.type === "error") {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? { ...msg, content: data.message }
                      : msg,
                  ),
                );
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      } catch (err) {
        console.error("[ConversationPanel] Send error:", err);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  content: "Przepraszam, wystapil blad. Sprobuj ponownie.",
                }
              : msg,
          ),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [conversationId, isLoading],
  );

  // ============================================================================
  // VOICE INPUT
  // ============================================================================

  const startListening = useCallback(() => {
    setTranscript("");
    const speech = createSpeechRecognition({
      language: "pl-PL",
      continuous: false,
      interimResults: true,
      onResult: (text, isFinal) => {
        setTranscript(text);
        if (isFinal) {
          setIsListening(false);
          sendMessage(text, "voice_transcript");
        }
      },
      onStart: () => setIsListening(true),
      onEnd: () => setIsListening(false),
      onError: () => setIsListening(false),
    });

    speechRef.current = speech;
    speech.start();
  }, [sendMessage]);

  const stopListening = useCallback(() => {
    speechRef.current?.stop();
    setIsListening(false);
  }, []);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h2
                className={cn(
                  "font-semibold text-muted-foreground mb-2",
                  compact ? "text-lg" : "text-xl",
                )}
              >
                Czesc! Jestem IORS.
              </h2>
              <p className="text-sm text-muted-foreground/70">
                Napisz wiadomosc lub kliknij mikrofon, zeby porozmawiac.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={cn(
                "rounded-2xl px-4 py-2.5",
                compact ? "max-w-[85%]" : "max-w-[80%]",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              {msg.type === "voice_transcript" && (
                <span className="text-xs opacity-60 mt-1 block">
                  <Mic className="w-3 h-3 inline mr-1" />
                  glos
                </span>
              )}
              {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                <span className="text-xs opacity-60 mt-1 block">
                  Uzyto: {msg.toolsUsed.join(", ")}
                </span>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl px-4 py-2.5">
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Transcript indicator */}
      {transcript && isListening && (
        <div className="px-4 py-2 bg-muted/50 border-t">
          <p className="text-sm text-muted-foreground italic">{transcript}</p>
        </div>
      )}

      {/* Input area */}
      <div className="p-3 border-t bg-card">
        <div className="flex items-center gap-2">
          {/* Voice toggle */}
          {isSpeechSupported && (
            <button
              onClick={isListening ? stopListening : startListening}
              className={cn(
                "p-2.5 rounded-full transition-colors shrink-0",
                isListening
                  ? "bg-destructive text-destructive-foreground animate-pulse"
                  : "bg-muted text-muted-foreground hover:bg-accent",
              )}
              title={isListening ? "Zatrzymaj" : "Mow"}
            >
              {isListening ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && !e.shiftKey && sendMessage(input)
            }
            placeholder="Napisz wiadomosc..."
            className="flex-1 bg-muted border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent text-sm"
            disabled={isLoading}
          />

          {/* Send button */}
          <button
            onClick={() => sendMessage(input)}
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
