"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Mic,
  MicOff,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
} from "lucide-react";
import {
  createSpeechRecognition,
  isWebSpeechSupported,
  type WebSpeechInstance,
} from "@/lib/voice/web-speech";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { UnifiedMessage } from "./types";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  type: "text" | "voice_transcript";
  timestamp: Date;
}

interface ConversationCenterProps {
  selectedMessage?: UnifiedMessage | null;
  className?: string;
}

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  voice: "Telefon",
  web_chat: "Chat",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
};

export function ConversationCenter({
  selectedMessage,
  className,
}: ConversationCenterProps) {
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

  // When a message is selected, add context about it
  useEffect(() => {
    if (selectedMessage) {
      // Add a context message about the selected message
      const contextMsg: Message = {
        id: `context-${selectedMessage.id}`,
        role: "assistant",
        content: formatSelectedMessageContext(selectedMessage),
        type: "text",
        timestamp: new Date(),
      };
      setMessages([contextMsg]);
    }
  }, [selectedMessage?.id]);

  function formatSelectedMessageContext(msg: UnifiedMessage): string {
    const channel = CHANNEL_LABELS[msg.channel] || msg.channel;
    const from = msg.metadata?.from || "Nieznany nadawca";
    const subject = msg.metadata?.subject || "";
    const date = msg.metadata?.date
      ? new Date(msg.metadata.date as string).toLocaleString("pl-PL")
      : new Date(msg.created_at).toLocaleString("pl-PL");

    let context = `**Wybrana wiadomosc (${channel})**\n\n`;
    context += `Od: ${from}\n`;
    if (subject) context += `Temat: ${subject}\n`;
    context += `Data: ${date}\n\n`;
    context += `Jak moge Ci pomoc z ta wiadomoscia? Moge:\n`;
    context += `- Odpowiedziec na nia\n`;
    context += `- Stworzyc z niej task\n`;
    context += `- Przypisac do projektu\n`;
    context += `- Podsumowac lub przeanalizowac`;

    return context;
  }

  const sendMessage = useCallback(
    async (text: string, type: "text" | "voice_transcript" = "text") => {
      if (!text.trim() || isLoading) return;

      // Include context about selected message in the prompt
      let messageWithContext = text.trim();
      if (selectedMessage) {
        messageWithContext = `[Kontekst: Uzytkownik rozmawia o wiadomosci: kanal=${selectedMessage.channel}, od=${selectedMessage.metadata?.from || "nieznany"}, temat=${selectedMessage.metadata?.subject || "brak"}, tresc="${selectedMessage.content.slice(0, 200)}..."]\n\nUzytkownik: ${text.trim()}`;
      }

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
            message: messageWithContext,
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
        console.error("[ConversationCenter] Send error:", err);
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
    [isLoading, conversationId, selectedMessage],
  );

  const startListening = useCallback(() => {
    if (!isSpeechSupported || isListening) return;

    const speech = createSpeechRecognition({
      onResult: (text) => setTranscript(text),
      onEnd: () => setIsListening(false),
      language: "pl-PL",
    });

    if (speech) {
      speechRef.current = speech;
      speech.start();
      setIsListening(true);
    }
  }, [isSpeechSupported, isListening]);

  const stopListening = useCallback(() => {
    if (speechRef.current) {
      speechRef.current.stop();
      speechRef.current = null;
    }
    setIsListening(false);

    if (transcript.trim()) {
      sendMessage(transcript.trim(), "voice_transcript");
    }
  }, [transcript, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Header */}
      <div className="p-4 border-b flex items-center gap-3">
        {selectedMessage ? (
          <>
            {selectedMessage.channel === "email" && (
              <Mail className="h-5 w-5 text-blue-500" />
            )}
            {selectedMessage.channel === "sms" && (
              <MessageSquare className="h-5 w-5 text-green-500" />
            )}
            {selectedMessage.channel === "voice" && (
              <Phone className="h-5 w-5 text-purple-500" />
            )}
            <div>
              <h2 className="font-semibold">
                {selectedMessage.metadata?.subject ||
                  selectedMessage.metadata?.from ||
                  "Rozmowa z IORS"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {CHANNEL_LABELS[selectedMessage.channel]} |{" "}
                {new Date(selectedMessage.created_at).toLocaleDateString(
                  "pl-PL",
                )}
              </p>
            </div>
          </>
        ) : (
          <div>
            <h2 className="font-semibold">Rozmowa z IORS</h2>
            <p className="text-sm text-muted-foreground">
              Wybierz wiadomosc z listy po lewej
            </p>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {messages.length === 0 && !selectedMessage && (
            <div className="text-center text-muted-foreground py-12">
              <p>Wybierz wiadomosc z listy, aby rozpoczac rozmowe.</p>
            </div>
          )}

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
                  "rounded-2xl px-4 py-2.5 max-w-[80%]",
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
              </div>
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.content === "" && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl px-4 py-2.5">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t">
        {isListening && transcript && (
          <div className="mb-2 p-2 bg-muted rounded-lg text-sm text-muted-foreground">
            <Mic className="w-3 h-3 inline mr-1 text-red-500 animate-pulse" />
            {transcript}
          </div>
        )}

        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Napisz wiadomosc..."
            className="flex-1 px-4 py-2 border rounded-full bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isLoading}
          />

          {isSpeechSupported && (
            <Button
              variant={isListening ? "destructive" : "outline"}
              size="icon"
              className="rounded-full"
              onClick={isListening ? stopListening : startListening}
              disabled={isLoading}
            >
              {isListening ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
          )}

          <Button
            size="icon"
            className="rounded-full"
            onClick={() => sendMessage(input)}
            disabled={isLoading || !input.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
