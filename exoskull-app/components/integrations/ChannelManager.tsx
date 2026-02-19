"use client";

import { cn } from "@/lib/utils";
import type { ChannelType } from "@/lib/stream/types";
import { MessageSquare, Phone, Mail, Hash, MessageCircle } from "lucide-react";

const CHANNELS: { id: ChannelType; label: string; icon: React.ElementType }[] =
  [
    { id: "web_chat", label: "Web Chat", icon: MessageSquare },
    { id: "sms", label: "SMS", icon: Phone },
    { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
    { id: "telegram", label: "Telegram", icon: Hash },
    { id: "discord", label: "Discord", icon: Hash },
    { id: "email", label: "Email", icon: Mail },
    { id: "messenger", label: "Messenger", icon: MessageCircle },
    { id: "instagram", label: "Instagram", icon: MessageCircle },
    { id: "slack", label: "Slack", icon: Hash },
    { id: "signal", label: "Signal", icon: MessageCircle },
    { id: "voice", label: "Voice", icon: Phone },
    { id: "imessage", label: "iMessage", icon: MessageCircle },
  ];

interface ChannelManagerProps {
  enabledChannels?: ChannelType[];
  onToggle?: (channel: ChannelType, enabled: boolean) => void;
}

export function ChannelManager({
  enabledChannels = ["web_chat"],
  onToggle,
}: ChannelManagerProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Kanaly komunikacji</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {CHANNELS.map((ch) => {
          const enabled = enabledChannels.includes(ch.id);
          return (
            <button
              key={ch.id}
              onClick={() => onToggle?.(ch.id, !enabled)}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors",
                enabled
                  ? "bg-primary/10 border-primary/30 text-foreground"
                  : "bg-card border-border text-muted-foreground hover:bg-muted",
              )}
            >
              <ch.icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{ch.label}</span>
              {enabled && (
                <span className="ml-auto w-2 h-2 rounded-full bg-green-500 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
