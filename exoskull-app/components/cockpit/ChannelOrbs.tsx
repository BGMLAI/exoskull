"use client";

import { Mail, MessageCircle, Phone, Camera, Radio, Hash } from "lucide-react";
import { useCockpitStore } from "@/lib/stores/useCockpitStore";

interface ChannelOrb {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const CHANNELS: ChannelOrb[] = [
  {
    id: "instagram",
    label: "Instagram",
    icon: <Camera size={14} />,
    color: "#e1306c",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: <MessageCircle size={14} />,
    color: "#25d366",
  },
  {
    id: "messenger",
    label: "Messenger",
    icon: <Radio size={14} />,
    color: "#0084ff",
  },
  {
    id: "phone",
    label: "Telefon",
    icon: <Phone size={14} />,
    color: "#10b981",
  },
  {
    id: "email",
    label: "Email",
    icon: <Mail size={14} />,
    color: "#06b6d4",
  },
  {
    id: "discord",
    label: "Discord",
    icon: <Hash size={14} />,
    color: "#8b5cf6",
  },
];

/**
 * ChannelOrbs — Floating channel indicators at top-right of the cockpit.
 * Each orb = circular icon with glow ring, hover = name, click = filter chat.
 */
export function ChannelOrbs() {
  const openPreview = useCockpitStore((s) => s.openPreview);

  return (
    <div className="cockpit-channel-orbs">
      {CHANNELS.map((ch, i) => (
        <div
          key={ch.id}
          className="cockpit-channel-orb"
          title={ch.label}
          style={
            {
              "--ch-color": ch.color,
              animationDelay: `${i * 50}ms`,
            } as React.CSSProperties
          }
          onClick={() => {
            openPreview({
              type: "activity",
              id: ch.id,
              title: ch.label,
              data: { channel: ch.id },
            });
          }}
        >
          {ch.icon}
        </div>
      ))}
    </div>
  );
}
