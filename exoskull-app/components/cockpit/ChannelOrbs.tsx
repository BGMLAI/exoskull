"use client";

import { Mail, MessageCircle, Hash, Phone } from "lucide-react";

interface ChannelOrb {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const CHANNELS: ChannelOrb[] = [
  { id: "email", label: "Email", icon: <Mail size={14} />, color: "#06b6d4" },
  {
    id: "telegram",
    label: "Telegram",
    icon: <MessageCircle size={14} />,
    color: "#3b82f6",
  },
  {
    id: "discord",
    label: "Discord",
    icon: <Hash size={14} />,
    color: "#8b5cf6",
  },
  { id: "sms", label: "SMS", icon: <Phone size={14} />, color: "#10b981" },
];

/**
 * ChannelOrbs — Floating channel indicators at top-right of the cockpit.
 * Each orb represents a communication channel with a glow ring.
 */
export function ChannelOrbs() {
  return (
    <div
      style={{
        position: "fixed",
        top: 44,
        right: 16,
        zIndex: 12,
        display: "flex",
        gap: 8,
        pointerEvents: "auto",
      }}
    >
      {CHANNELS.map((ch, i) => (
        <div
          key={ch.id}
          title={ch.label}
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${ch.color}15`,
            border: `1px solid ${ch.color}40`,
            color: ch.color,
            cursor: "pointer",
            transition: "all 0.2s",
            animation: `hudPanelSlideIn 0.3s ease-out ${i * 50}ms both`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = `0 0 12px ${ch.color}40`;
            e.currentTarget.style.borderColor = ch.color;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.borderColor = `${ch.color}40`;
          }}
        >
          {ch.icon}
        </div>
      ))}
    </div>
  );
}
