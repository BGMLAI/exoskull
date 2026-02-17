"use client";

import { X, Check, Smile, Paperclip } from "lucide-react";

/**
 * ReactionButtons — Floating action/reaction buttons at top-left of cockpit.
 * Quick emoji reactions + attachment button for chat.
 */
export function ReactionButtons() {
  const buttons = [
    {
      icon: <X size={14} />,
      label: "Odrzuć",
      color: "#ef4444",
      action: "reject",
    },
    {
      icon: <Check size={14} />,
      label: "Akceptuj",
      color: "#10b981",
      action: "accept",
    },
    {
      icon: <Smile size={14} />,
      label: "Reakcja",
      color: "#f59e0b",
      action: "react",
    },
    {
      icon: <Paperclip size={14} />,
      label: "Załącznik",
      color: "#06b6d4",
      action: "attach",
    },
  ];

  return (
    <div className="cockpit-reactions">
      {buttons.map((btn, i) => (
        <button
          key={btn.action}
          className="cockpit-reaction-btn"
          title={btn.label}
          style={
            {
              "--reaction-color": btn.color,
              animationDelay: `${i * 50}ms`,
            } as React.CSSProperties
          }
          onClick={() => {
            // Reactions dispatch to chat or IORS
            // For now visual placeholder — will connect to stream
          }}
        >
          {btn.icon}
        </button>
      ))}
    </div>
  );
}
