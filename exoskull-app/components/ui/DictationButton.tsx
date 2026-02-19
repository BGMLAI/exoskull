"use client";

import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface DictationButtonProps {
  isListening: boolean;
  isSupported: boolean;
  onClick: () => void;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function DictationButton({
  isListening,
  isSupported,
  onClick,
  disabled = false,
  size = "sm",
  className,
}: DictationButtonProps) {
  if (!isSupported) return null;

  const iconSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  const buttonSize = size === "sm" ? "p-2" : "p-2.5";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-full transition-colors shrink-0",
        buttonSize,
        isListening
          ? "bg-destructive text-destructive-foreground animate-pulse"
          : "bg-muted text-muted-foreground hover:bg-muted/80",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
      title={isListening ? "Zatrzymaj nagrywanie" : "Dyktuj"}
      aria-label={isListening ? "Zatrzymaj nagrywanie" : "Dyktuj"}
    >
      {isListening ? (
        <MicOff className={iconSize} />
      ) : (
        <Mic className={iconSize} />
      )}
    </button>
  );
}
