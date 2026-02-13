/**
 * ChatBubble — Minimized chat cloud when in Graph mode
 *
 * Shows as a floating cloud/bubble in the corner. Clicking it
 * either expands to show recent messages or switches back to Chat mode.
 *
 * Features:
 * - Pulsing indicator for new messages
 * - Quick message input without leaving Graph mode
 * - Expand to see last few messages
 * - Click to switch back to full Chat mode
 */
"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useInterfaceStore } from "@/lib/stores/useInterfaceStore";
import { cn } from "@/lib/utils";
import { MessageCircle, Send, Minimize2, X, ChevronUp } from "lucide-react";

interface ChatBubbleProps {
  /** Recent messages to show in expanded view */
  recentMessages?: Array<{
    id: string;
    role: "user" | "ai";
    content: string;
    timestamp: Date;
  }>;
  /** Callback to send a quick message */
  onSendMessage?: (text: string) => void;
  /** Whether AI is currently responding */
  isLoading?: boolean;
  /** Number of unread messages */
  unreadCount?: number;
}

export function ChatBubble({
  recentMessages = [],
  onSendMessage,
  isLoading = false,
  unreadCount = 0,
}: ChatBubbleProps) {
  const { setMode, chatBubbleExpanded, setChatBubbleExpanded } =
    useInterfaceStore();
  const [quickInput, setQuickInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when new messages
  useEffect(() => {
    if (chatBubbleExpanded && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [recentMessages, chatBubbleExpanded]);

  const handleBubbleClick = useCallback(() => {
    if (!chatBubbleExpanded) {
      setChatBubbleExpanded(true);
    }
  }, [chatBubbleExpanded, setChatBubbleExpanded]);

  const handleSwitchToChat = useCallback(() => {
    setChatBubbleExpanded(false);
    setMode("chat");
  }, [setMode, setChatBubbleExpanded]);

  const handleClose = useCallback(() => {
    setChatBubbleExpanded(false);
  }, [setChatBubbleExpanded]);

  const handleSend = useCallback(() => {
    if (!quickInput.trim() || isLoading) return;
    onSendMessage?.(quickInput.trim());
    setQuickInput("");
  }, [quickInput, isLoading, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === "Escape") {
        handleClose();
      }
    },
    [handleSend, handleClose],
  );

  // Focus input when expanded
  useEffect(() => {
    if (chatBubbleExpanded) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [chatBubbleExpanded]);

  const lastMessages = recentMessages.slice(-5);

  return (
    <div
      className={cn(
        "fixed z-50",
        "transition-all duration-500 ease-out-expo",
        // Position: bottom-left corner
        "bottom-6 left-6",
      )}
    >
      {/* Expanded chat panel */}
      {chatBubbleExpanded && (
        <div
          className={cn(
            "w-80 mb-3 rounded-2xl overflow-hidden",
            "bg-card/95 backdrop-blur-xl",
            "border border-border/50",
            "shadow-2xl shadow-black/30",
            "animate-in slide-in-from-bottom-4 fade-in duration-300",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
            <button
              onClick={handleSwitchToChat}
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Otwórz chat</span>
              <ChevronUp className="w-3 h-3 text-muted-foreground" />
            </button>
            <button
              onClick={handleClose}
              className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Messages */}
          <div className="max-h-60 overflow-y-auto px-3 py-2 space-y-2">
            {lastMessages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Napisz coś...
              </p>
            )}
            {lastMessages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] px-3 py-1.5 rounded-2xl text-xs",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm",
                  )}
                >
                  {msg.content.length > 120
                    ? msg.content.slice(0, 120) + "..."
                    : msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted px-3 py-2 rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick input */}
          <div className="flex items-center gap-2 px-3 py-2 border-t border-border/30">
            <input
              ref={inputRef}
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Szybka wiadomość..."
              className="flex-1 bg-muted border-none rounded-xl px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!quickInput.trim() || isLoading}
              className="p-1.5 bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground text-primary-foreground rounded-full transition-colors"
            >
              <Send className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Bubble button */}
      <button
        onClick={handleBubbleClick}
        className={cn(
          "relative group",
          "w-14 h-14 rounded-full",
          "bg-card/90 backdrop-blur-xl",
          "border border-border/50",
          "shadow-xl shadow-black/20",
          "flex items-center justify-center",
          "transition-all duration-300",
          "hover:scale-110 hover:shadow-2xl hover:border-primary/30",
          chatBubbleExpanded && "scale-90 opacity-60",
        )}
      >
        <MessageCircle
          className={cn(
            "w-6 h-6 transition-colors",
            unreadCount > 0 ? "text-primary" : "text-muted-foreground",
          )}
        />

        {/* Unread badge */}
        {unreadCount > 0 && !chatBubbleExpanded && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}

        {/* Pulse ring for new messages */}
        {unreadCount > 0 && !chatBubbleExpanded && (
          <span className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping" />
        )}
      </button>
    </div>
  );
}
