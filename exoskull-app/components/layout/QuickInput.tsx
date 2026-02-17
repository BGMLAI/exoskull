"use client";

import { useState, useCallback, type KeyboardEvent } from "react";
import { Send, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFloatingPanelsStore } from "@/lib/stores/useFloatingPanelsStore";

interface QuickInputProps {
  tenantId: string;
  onSend?: (message: string) => void;
}

/**
 * QuickInput — Mini chat input bar fixed at the bottom of the screen.
 *
 * Positioned above PanelDock (z-40). Acts as a shortcut to open/focus the
 * chat floating panel. On submit it opens the chat panel so the user can
 * continue the conversation there (HomeChat handles actual streaming).
 */
export function QuickInput({ tenantId, onSend }: QuickInputProps) {
  const [value, setValue] = useState("");
  const openPanel = useFloatingPanelsStore((s) => s.openPanel);
  const focusPanel = useFloatingPanelsStore((s) => s.focusPanel);
  const restorePanel = useFloatingPanelsStore((s) => s.restorePanel);
  const panels = useFloatingPanelsStore((s) => s.panels);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;

    // Open or restore+focus the chat panel
    const chatState = panels["chat"];
    if (!chatState) {
      openPanel("chat");
    } else if (chatState.minimized) {
      restorePanel("chat");
    } else {
      focusPanel("chat");
    }

    // Callback for parent if provided
    onSend?.(trimmed);

    // Clear input
    setValue("");
  }, [value, panels, openPanel, restorePanel, focusPanel, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleFocus = useCallback(() => {
    // When user clicks into quick input, ensure chat panel is visible
    const chatState = panels["chat"];
    if (!chatState) {
      openPanel("chat");
    } else if (chatState.minimized) {
      restorePanel("chat");
    }
  }, [panels, openPanel, restorePanel]);

  return (
    <div
      className={cn(
        "fixed z-40 bottom-14 left-1/2 -translate-x-1/2",
        "w-full max-w-lg px-4",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2",
          "bg-card/90 backdrop-blur-md",
          "border border-border rounded-xl shadow-lg",
          "transition-all duration-200",
          "focus-within:border-primary/50 focus-within:shadow-primary/10",
        )}
      >
        {/* Mic placeholder */}
        <button
          type="button"
          className={cn(
            "flex-shrink-0 p-1 rounded-md",
            "text-muted-foreground hover:text-foreground",
            "hover:bg-accent/50 transition-colors duration-150",
          )}
          title="Voice input (coming soon)"
          aria-label="Voice input"
        >
          <Mic className="w-4 h-4" />
        </button>

        {/* Text input */}
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder="Ask ExoSkull anything..."
          className={cn(
            "flex-1 bg-transparent text-sm text-foreground",
            "placeholder:text-muted-foreground/60",
            "outline-none border-none",
          )}
        />

        {/* Send button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!value.trim()}
          className={cn(
            "flex-shrink-0 p-1.5 rounded-md",
            "transition-all duration-150",
            value.trim()
              ? "text-primary hover:bg-primary/10 hover:text-primary"
              : "text-muted-foreground/40 cursor-not-allowed",
          )}
          title="Send message"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
