"use client";

import {
  MessageSquare,
  Phone,
  Mail,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent, ChannelMessageData } from "@/lib/stream/types";

interface ChannelMessageProps {
  event: StreamEvent;
}

const channelConfig: Record<
  string,
  { label: string; color: string; borderColor: string }
> = {
  whatsapp: {
    label: "WhatsApp",
    color: "text-green-600",
    borderColor: "border-l-green-500",
  },
  sms: {
    label: "SMS",
    color: "text-blue-600",
    borderColor: "border-l-blue-500",
  },
  telegram: {
    label: "Telegram",
    color: "text-sky-500",
    borderColor: "border-l-sky-500",
  },
  discord: {
    label: "Discord",
    color: "text-indigo-500",
    borderColor: "border-l-indigo-500",
  },
  email: {
    label: "Email",
    color: "text-red-500",
    borderColor: "border-l-red-500",
  },
  signal: {
    label: "Signal",
    color: "text-blue-700",
    borderColor: "border-l-blue-700",
  },
  slack: {
    label: "Slack",
    color: "text-purple-600",
    borderColor: "border-l-purple-600",
  },
  messenger: {
    label: "Messenger",
    color: "text-blue-500",
    borderColor: "border-l-blue-500",
  },
  imessage: {
    label: "iMessage",
    color: "text-blue-400",
    borderColor: "border-l-blue-400",
  },
  instagram: {
    label: "Instagram",
    color: "text-pink-500",
    borderColor: "border-l-pink-500",
  },
  voice: {
    label: "Voice",
    color: "text-amber-500",
    borderColor: "border-l-amber-500",
  },
  web_chat: {
    label: "Web",
    color: "text-foreground",
    borderColor: "border-l-foreground",
  },
};

export function ChannelMessage({ event }: ChannelMessageProps) {
  const data = event.data as ChannelMessageData;
  const config = channelConfig[data.channel] || channelConfig.web_chat;
  const isInbound = data.direction === "inbound";
  const DirectionIcon = isInbound ? ArrowDownLeft : ArrowUpRight;
  const ChannelIcon =
    data.channel === "email"
      ? Mail
      : data.channel === "voice"
        ? Phone
        : MessageSquare;

  return (
    <div
      className={cn(
        "pl-3 border-l-2 animate-in fade-in duration-300",
        config.borderColor,
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <ChannelIcon className={cn("w-3.5 h-3.5", config.color)} />
        <span className={cn("text-xs font-medium", config.color)}>
          {config.label}
        </span>
        <DirectionIcon
          className={cn(
            "w-3 h-3",
            isInbound ? "text-green-500" : "text-blue-500",
          )}
        />
        {data.senderName && (
          <span className="text-xs text-muted-foreground">
            {data.senderName}
          </span>
        )}
      </div>
      <p className="text-sm text-foreground whitespace-pre-wrap">
        {data.content}
      </p>
    </div>
  );
}
