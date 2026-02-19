"use client";

import { X, Check, Smile, Paperclip } from "lucide-react";
import { useCockpitStore } from "@/lib/stores/useCockpitStore";
import { useCallback, useRef } from "react";

/**
 * ReactionButtons — Floating action/reaction buttons at top-left of cockpit.
 * Quick emoji reactions + attachment button for chat.
 *
 * - Reject: sends thumbs-down reaction to last IORS message
 * - Accept: sends thumbs-up reaction to last IORS message
 * - React: sends a smile emoji reaction
 * - Attach: triggers file upload dialog (clicks the hidden file input in VoiceInputBar)
 */
export function ReactionButtons() {
  const sendFromActionBar = useCockpitStore((s) => s.sendFromActionBar);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleReaction = useCallback(
    (action: string) => {
      switch (action) {
        case "reject":
          sendFromActionBar("👎");
          break;
        case "accept":
          sendFromActionBar("👍");
          break;
        case "react":
          sendFromActionBar("😊");
          break;
        case "attach": {
          // Trigger the file upload input in VoiceInputBar
          const fileInput = document.querySelector(
            'input[type="file"][data-voice-upload]',
          ) as HTMLInputElement | null;
          if (fileInput) {
            fileInput.click();
          } else {
            // Fallback: own file input
            fileInputRef.current?.click();
          }
          break;
        }
      }
    },
    [sendFromActionBar],
  );

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
          aria-label={btn.label}
          style={
            {
              "--reaction-color": btn.color,
              animationDelay: `${i * 50}ms`,
            } as React.CSSProperties
          }
          onClick={() => handleReaction(btn.action)}
        >
          {btn.icon}
        </button>
      ))}
      {/* Hidden file input fallback for attach button */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*,.pdf,.doc,.docx,.txt,.csv,.json,.xml"
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) {
            sendFromActionBar(`[Załączono ${files.length} plik(ów)]`);
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
