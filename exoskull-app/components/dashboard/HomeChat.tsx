"use client";

/**
 * HomeChat — Simple, useful chat for dashboard home.
 *
 * Shows:
 * 1. Recent conversations/messages timeline
 * 2. Incoming notifications (emails, SMS)
 * 3. Simple input to start chatting
 *
 * NOT a complex 3-column inbox — just a useful chat log.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send,
  Mail,
  MessageSquare,
  MessageCircle,
  Hash,
  Gamepad2,
  MessagesSquare,
  Globe,
  Phone,
  Clock,
  Bot,
  User,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HomeChatProps {
  tenantId: string;
  assistantName?: string;
}

interface TimelineItem {
  id: string;
  type: "conversation" | "email" | "sms" | "voice" | "system";
  role: "user" | "assistant" | "inbound";
  content: string;
  subject?: string;
  from?: string;
  timestamp: Date;
  channel?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export function HomeChat({ tenantId, assistantName = "IORS" }: HomeChatProps) {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingTimeline, setLoadingTimeline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      readerRef.current?.cancel().catch(() => {});
    };
  }, []);

  // Fetch recent activity (conversations + messages)
  const fetchTimeline = useCallback(async () => {
    setLoadingTimeline(true);
    setError(null);

    try {
      // Fetch both conversations and unified messages in parallel
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;
      const [conversationsRes, messagesRes] = await Promise.all([
        fetch(`/api/conversations?limit=10&tenantId=${tenantId}`, { signal }),
        fetch(`/api/unified-thread?limit=20&tenantId=${tenantId}`, { signal }),
      ]);

      const items: TimelineItem[] = [];

      // Process conversations
      if (conversationsRes.ok) {
        const { conversations } = await conversationsRes.json();
        if (conversations?.length) {
          for (const conv of conversations) {
            // Add conversation summary
            if (conv.summary) {
              items.push({
                id: `conv-${conv.id}`,
                type: "conversation",
                role: "assistant",
                content: conv.summary,
                timestamp: new Date(conv.ended_at || conv.started_at),
              });
            }
          }
        }
      }

      // Process unified messages (emails, SMS, etc.)
      if (messagesRes.ok) {
        const { messages } = await messagesRes.json();
        if (messages?.length) {
          for (const msg of messages) {
            items.push({
              id: msg.id,
              type: msg.channel || "system",
              role: msg.direction === "outbound" ? "assistant" : "inbound",
              content:
                msg.content?.slice(0, 200) +
                (msg.content?.length > 200 ? "..." : ""),
              subject: msg.metadata?.subject,
              from: msg.metadata?.from,
              timestamp: new Date(msg.created_at),
              channel: msg.channel,
            });
          }
        }
      }

      // Sort by timestamp (newest first for display, but we'll reverse for chat)
      items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Take top 15, then reverse for chronological order
      const recent = items.slice(0, 15).reverse();
      setTimeline(recent);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.error("[HomeChat] Fetch error:", err);
      setError("Nie udało się załadować historii");
    } finally {
      setLoadingTimeline(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [timeline, chatMessages]);

  const sendMessage = async () => {
    const messageText = input.trim();
    if (!messageText || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    const assistantMsgId = `assistant-${Date.now()}`;
    setChatMessages((prev) => [
      ...prev,
      {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      },
    ]);

    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          conversationId,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No response body");

      // Track reader for cleanup on unmount
      readerRef.current = reader;
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
              setChatMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, content: msg.content + data.text }
                    : msg,
                ),
              );
            } else if (data.type === "error") {
              setChatMessages((prev) =>
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

      readerRef.current = null;
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.error("[HomeChat] Send error:", err);
      const errorMsg = err?.message || "Nieznany błąd";
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? { ...msg, content: `Błąd: ${errorMsg}` }
            : msg,
        ),
      );
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

  const getChannelIcon = (type: string) => {
    switch (type) {
      case "email":
        return <Mail className="w-3.5 h-3.5 text-blue-500" />;
      case "sms":
        return <MessageSquare className="w-3.5 h-3.5 text-green-500" />;
      case "voice":
        return <Phone className="w-3.5 h-3.5 text-purple-500" />;
      case "whatsapp":
        return <MessageCircle className="w-3.5 h-3.5 text-green-600" />;
      case "telegram":
        return <Send className="w-3.5 h-3.5 text-sky-500" />;
      case "slack":
        return <Hash className="w-3.5 h-3.5 text-pink-500" />;
      case "discord":
        return <Gamepad2 className="w-3.5 h-3.5 text-indigo-500" />;
      case "messenger":
        return <MessagesSquare className="w-3.5 h-3.5 text-blue-600" />;
      case "web_chat":
        return <Globe className="w-3.5 h-3.5 text-primary" />;
      case "conversation":
        return <Bot className="w-3.5 h-3.5 text-primary" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return "teraz";
    if (mins < 60) return `${mins}min temu`;
    if (hours < 24) return `${hours}h temu`;
    if (days < 7) return `${days}d temu`;
    return date.toLocaleDateString("pl-PL");
  };

  return (
    <div className="flex flex-col h-full bg-background border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <span className="font-medium">Chat z {assistantName}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchTimeline}
          disabled={loadingTimeline}
          className="h-8 w-8 p-0"
        >
          <RefreshCw
            className={cn("w-4 h-4", loadingTimeline && "animate-spin")}
          />
        </Button>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Error state */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Loading state */}
        {loadingTimeline && !timeline.length && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex gap-3">
                <div className="w-8 h-8 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loadingTimeline && !timeline.length && !chatMessages.length && (
          <div className="text-center py-8 text-muted-foreground">
            <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Brak historii rozmów</p>
            <p className="text-sm mt-1">Napisz coś, żeby zacząć!</p>
          </div>
        )}

        {/* Timeline items */}
        {timeline.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex gap-3",
              item.role === "user" ? "flex-row-reverse" : "",
            )}
          >
            {/* Avatar */}
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                item.role === "inbound"
                  ? "bg-blue-100 dark:bg-blue-900"
                  : item.role === "assistant"
                    ? "bg-primary/10"
                    : "bg-muted",
              )}
            >
              {item.role === "inbound" ? (
                getChannelIcon(item.type)
              ) : item.role === "assistant" ? (
                <Bot className="w-4 h-4 text-primary" />
              ) : (
                <User className="w-4 h-4 text-muted-foreground" />
              )}
            </div>

            {/* Content */}
            <div
              className={cn(
                "flex-1 max-w-[80%]",
                item.role === "user" ? "text-right" : "",
              )}
            >
              {/* Header for inbound messages */}
              {item.role === "inbound" && (item.from || item.subject) && (
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  {getChannelIcon(item.type)}
                  <span>{item.from || item.subject}</span>
                </div>
              )}

              <div
                className={cn(
                  "inline-block rounded-2xl px-3 py-2 text-sm",
                  item.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : item.role === "inbound"
                      ? "bg-blue-50 dark:bg-blue-950 text-foreground border"
                      : "bg-muted text-foreground",
                )}
              >
                {item.subject && (
                  <div className="font-medium text-xs mb-1">{item.subject}</div>
                )}
                <p className="whitespace-pre-wrap">{item.content}</p>
              </div>

              <div className="text-xs text-muted-foreground mt-1">
                {formatTime(item.timestamp)}
              </div>
            </div>
          </div>
        ))}

        {/* Current chat messages */}
        {chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-3",
              msg.role === "user" ? "flex-row-reverse" : "",
            )}
          >
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                msg.role === "assistant" ? "bg-primary/10" : "bg-muted",
              )}
            >
              {msg.role === "assistant" ? (
                <Bot className="w-4 h-4 text-primary" />
              ) : (
                <User className="w-4 h-4 text-muted-foreground" />
              )}
            </div>

            <div
              className={cn(
                "flex-1 max-w-[80%]",
                msg.role === "user" ? "text-right" : "",
              )}
            >
              <div
                className={cn(
                  "inline-block rounded-2xl px-3 py-2 text-sm",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {msg.content || (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-current rounded-full animate-bounce" />
                    <span
                      className="w-2 h-2 bg-current rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    />
                    <span
                      className="w-2 h-2 bg-current rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    />
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-3 border-t bg-muted/30">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Napisz do IORS..."
            className="flex-1 px-4 py-2 text-sm border rounded-full bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isLoading}
          />
          <Button
            size="icon"
            className="rounded-full shrink-0"
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
