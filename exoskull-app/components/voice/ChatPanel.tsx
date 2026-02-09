"use client";

import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MessageSquare, Mic, Volume2 } from "lucide-react";
import { MarkdownContent } from "@/components/ui/markdown-content";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  isInterim?: boolean;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  isUserSpeaking?: boolean;
  isAgentSpeaking?: boolean;
  className?: string;
}

export function ChatPanel({
  messages,
  isUserSpeaking = false,
  isAgentSpeaking = false,
  className,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isUserSpeaking, isAgentSpeaking]);

  return (
    <Card className={cn("flex flex-col h-full", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Transkrypcja
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto px-6 pb-4 space-y-3"
        >
          {messages.length === 0 && !isUserSpeaking && !isAgentSpeaking && (
            <div className="text-center text-muted-foreground text-sm py-8">
              Rozpocznij rozmowe by zobaczyc transkrypcje
            </div>
          )}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {/* Typing indicators */}
          {isUserSpeaking && (
            <div className="flex justify-end">
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950 px-3 py-2 rounded-lg">
                <Mic className="h-4 w-4 animate-pulse text-blue-500" />
                <span>Mowisz...</span>
              </div>
            </div>
          )}

          {isAgentSpeaking && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded-lg">
                <Volume2 className="h-4 w-4 animate-pulse text-green-500" />
                <span>Agent mowi...</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="text-center">
        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] px-4 py-2 rounded-2xl",
          isUser
            ? "bg-blue-500 text-white rounded-br-md"
            : "bg-gray-100 dark:bg-gray-800 text-foreground rounded-bl-md",
          message.isInterim && "opacity-60",
        )}
      >
        {message.role === "assistant" ? (
          <MarkdownContent content={message.content} />
        ) : (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        )}
        <p
          className={cn(
            "text-xs mt-1",
            isUser ? "text-blue-100" : "text-muted-foreground",
          )}
        >
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
