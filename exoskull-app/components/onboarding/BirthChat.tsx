"use client";

/**
 * BirthChat — Text-based IORS birth flow for web onboarding.
 *
 * Uses the full processUserMessage pipeline (30+ tools)
 * via /api/onboarding/birth-chat.
 */

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send, Loader2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { BIRTH_FIRST_MESSAGE } from "@/lib/iors/birth-prompt";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface BirthChatProps {
  onBack: () => void;
}

export function BirthChat({ onBack }: BirthChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "greeting",
      role: "assistant",
      content: BIRTH_FIRST_MESSAGE,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
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
        body: JSON.stringify({ message: userText }),
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
        // Brief delay so user can read final message, then redirect
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 2000);
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
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

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
          <MessageSquare className="h-5 w-5 text-blue-400" />
          Rozmowa z IORS
        </CardTitle>
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

        {/* Input */}
        <div className="p-4 border-t border-slate-700">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Napisz coś..."
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
