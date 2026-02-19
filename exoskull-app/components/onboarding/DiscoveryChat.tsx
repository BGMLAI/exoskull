"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send, Loader2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DISCOVERY_SYSTEM_PROMPT,
  DISCOVERY_FIRST_MESSAGE,
} from "@/lib/onboarding/discovery-prompt";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface DiscoveryChatProps {
  onComplete: (conversationId: string) => void;
  onBack: () => void;
}

export function DiscoveryChat({ onComplete, onBack }: DiscoveryChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize conversation
  useEffect(() => {
    const initConversation = async () => {
      try {
        // Create conversation record
        const convResponse = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: {
              type: "onboarding",
              started_via: "discovery_chat",
            },
          }),
        });
        const { conversation } = await convResponse.json();
        setConversationId(conversation.id);

        // Add first message
        const firstMessage: Message = {
          id: "first",
          role: "assistant",
          content: DISCOVERY_FIRST_MESSAGE,
          timestamp: new Date(),
        };
        setMessages([firstMessage]);

        // Save first message
        await fetch(`/api/conversations/${conversation.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "assistant",
            content: DISCOVERY_FIRST_MESSAGE,
            context: { type: "greeting" },
          }),
        });

        setIsInitializing(false);
      } catch (error) {
        console.error("[DiscoveryChat] Init error:", error);
        setIsInitializing(false);
      }
    };

    initConversation();
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading || !conversationId) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Save user message
      await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "user",
          content: userMessage.content,
          context: { type: "chat" },
        }),
      });

      // Get AI response
      const response = await fetch("/api/onboarding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          message: userMessage.content,
          history: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const { reply, shouldComplete, profileData } = await response.json();

      // Add assistant message
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: reply,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Save assistant message
      await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "assistant",
          content: reply,
          context: { type: "chat" },
        }),
      });

      // Check if conversation should end
      if (shouldComplete && profileData) {
        // Save profile data
        await fetch("/api/onboarding/save-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            ...profileData,
          }),
        });

        // Complete onboarding
        setTimeout(() => {
          onComplete(conversationId);
        }, 2000);
      }
    } catch (error) {
      console.error("[DiscoveryChat] Send error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "system",
          content: "Przepraszam, wystąpił błąd. Spróbuj ponownie.",
          timestamp: new Date(),
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

  const handleEndChat = () => {
    if (conversationId) {
      onComplete(conversationId);
    }
  };

  if (isInitializing) {
    return (
      <Card className="w-full max-w-2xl bg-card/50 border-border">
        <CardContent className="p-12 text-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Przygotowuję rozmowę...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl bg-card/50 border-border">
      <CardHeader className="pb-2 flex flex-row items-center justify-between border-b border-border">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <CardTitle className="text-lg text-foreground flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Rozmowa tekstowa
          </CardTitle>
        </div>

        <Button variant="outline" size="sm" onClick={handleEndChat}>
          Zakończ rozmowę
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col h-[500px] p-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : message.role === "assistant"
                      ? "bg-muted text-foreground"
                      : "bg-muted/50 text-muted-foreground text-sm",
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl px-4 py-2">
                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Napisz coś..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button onClick={sendMessage} disabled={!input.trim() || isLoading}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
