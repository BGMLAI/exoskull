"use client";

import { useAppStore } from "@/lib/stores/useAppStore";
import type { ChannelType } from "@/lib/stream/types";
import { MessageSquare, Phone, Mail, Hash, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";

const CHANNEL_OPTIONS: {
  id: ChannelType;
  label: string;
  icon: React.ElementType;
}[] = [
  { id: "web_chat", label: "Chat", icon: MessageSquare },
  { id: "sms", label: "SMS", icon: Phone },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "email", label: "Email", icon: Mail },
  { id: "telegram", label: "Telegram", icon: Hash },
  { id: "voice", label: "Voice", icon: Phone },
];

/**
 * ChannelSelector — Dropdown to pick which channel to send through.
 */
export function ChannelSelector() {
  const activeChannel = useAppStore((s) => s.activeChannel);
  const setActiveChannel = useAppStore((s) => s.setActiveChannel);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current =
    CHANNEL_OPTIONS.find((c) => c.id === activeChannel) || CHANNEL_OPTIONS[0];
  const CurrentIcon = current.icon;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors",
          activeChannel === "web_chat"
            ? "text-muted-foreground hover:bg-muted"
            : "text-primary bg-primary/10",
        )}
        title={`Kanal: ${current.label}`}
      >
        <CurrentIcon className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{current.label}</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 bg-popover border rounded-lg shadow-lg z-50 min-w-[140px] py-1">
          {CHANNEL_OPTIONS.map((ch) => {
            const Icon = ch.icon;
            const isActive = ch.id === activeChannel;
            return (
              <button
                key={ch.id}
                onClick={() => {
                  setActiveChannel(ch.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <Icon className="w-4 h-4" />
                {ch.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
