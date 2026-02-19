"use client";

import { cn } from "@/lib/utils";
import {
  Mail,
  MessageSquare,
  Phone,
  MessageCircle,
  Instagram,
  Facebook,
} from "lucide-react";
import type { UnifiedMessage } from "./types";

interface MessageListItemProps {
  message: UnifiedMessage;
  isSelected: boolean;
  onClick: () => void;
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  email: <Mail className="h-4 w-4" />,
  sms: <MessageSquare className="h-4 w-4" />,
  voice: <Phone className="h-4 w-4" />,
  web_chat: <MessageCircle className="h-4 w-4" />,
  whatsapp: <MessageSquare className="h-4 w-4 text-green-500" />,
  messenger: <Facebook className="h-4 w-4 text-blue-500" />,
  instagram: <Instagram className="h-4 w-4 text-pink-500" />,
};

const CHANNEL_COLORS: Record<string, string> = {
  email: "bg-blue-500",
  sms: "bg-green-500",
  voice: "bg-purple-500",
  web_chat: "bg-orange-500",
  whatsapp: "bg-green-600",
  messenger: "bg-blue-600",
  instagram: "bg-pink-500",
};

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "teraz";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function parseFromField(from: string): { name: string; email: string } {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].replace(/"/g, "").trim(), email: match[2] };
  }
  return { name: from, email: from };
}

function getSenderName(message: UnifiedMessage): string {
  if (message.metadata?.from) {
    const parsed = parseFromField(message.metadata.from as string);
    return parsed.name || parsed.email;
  }
  if (message.role === "assistant") return "IORS";
  return "Nieznany";
}

function getPreviewText(message: UnifiedMessage): string {
  // For emails, show subject if available
  if (message.channel === "email" && message.metadata?.subject) {
    return message.metadata.subject as string;
  }

  // Extract first meaningful line from content
  const lines = message.content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("[") && !trimmed.startsWith("---")) {
      return trimmed.length > 60 ? trimmed.slice(0, 60) + "..." : trimmed;
    }
  }

  return message.content.slice(0, 60) + "...";
}

function getSnippet(message: UnifiedMessage): string {
  // Extract snippet from content (after ---)
  const parts = message.content.split("---");
  if (parts.length > 1) {
    const snippet = parts[1].trim();
    return snippet.length > 80 ? snippet.slice(0, 80) + "..." : snippet;
  }
  return "";
}

export function MessageListItem({
  message,
  isSelected,
  onClick,
}: MessageListItemProps) {
  const isUnread = message.metadata?.isUnread === true;
  const senderName = getSenderName(message);
  const previewText = getPreviewText(message);
  const snippet = getSnippet(message);
  const dateStr = formatDate(
    (message.metadata?.date as string) || message.created_at,
  );

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 hover:bg-muted/50 transition-colors",
        isSelected && "bg-muted",
        isUnread && "bg-blue-50/50 dark:bg-blue-950/20",
      )}
    >
      <div className="flex gap-3">
        {/* Avatar / Channel indicator */}
        <div
          className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center text-primary-foreground flex-shrink-0",
            CHANNEL_COLORS[message.channel] || "bg-muted",
          )}
        >
          {CHANNEL_ICONS[message.channel] || (
            <MessageCircle className="h-4 w-4" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "font-medium text-sm truncate",
                isUnread && "font-semibold",
              )}
            >
              {senderName}
            </span>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {dateStr}
            </span>
          </div>

          <p
            className={cn(
              "text-sm truncate",
              isUnread
                ? "font-medium text-foreground"
                : "text-muted-foreground",
            )}
          >
            {previewText}
          </p>

          {snippet && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {snippet}
            </p>
          )}
        </div>

        {/* Unread indicator */}
        {isUnread && (
          <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
        )}
      </div>
    </button>
  );
}
