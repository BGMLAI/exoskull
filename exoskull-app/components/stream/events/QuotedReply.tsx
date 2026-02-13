"use client";

import { Reply, User, Bot, Cog, CornerDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent } from "@/lib/stream/types";

interface QuotedReplyProps {
  replyTo: NonNullable<StreamEvent["replyTo"]>;
  /** Whether this is a compact inline display or full thread branch */
  compact?: boolean;
  /** Click handler — scrolls to and highlights original message */
  onClick?: () => void;
}

const ROLE_CONFIG = {
  user: {
    icon: User,
    label: "Ty",
    borderColor: "border-l-primary",
    textColor: "text-primary/80",
    bgColor: "bg-primary/5",
  },
  ai: {
    icon: Bot,
    label: "ExoSkull",
    borderColor: "border-l-purple-500 dark:border-l-purple-400",
    textColor: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-500/5",
  },
  system: {
    icon: Cog,
    label: "System",
    borderColor: "border-l-amber-500",
    textColor: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500/5",
  },
};

export function QuotedReply({
  replyTo,
  compact = false,
  onClick,
}: QuotedReplyProps) {
  const config = ROLE_CONFIG[replyTo.senderRole] || ROLE_CONFIG.system;
  const Icon = config.icon;

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    // Default: scroll to original message and highlight
    const el = document.getElementById(`stream-event-${replyTo.id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary/50", "transition-all");
      setTimeout(
        () =>
          el.classList.remove("ring-2", "ring-primary/50", "transition-all"),
        2000,
      );
    }
  };

  return (
    <div
      className={cn(
        "flex items-start gap-1.5 border-l-2 pl-2 rounded-r-sm transition-colors cursor-pointer hover:brightness-95",
        config.borderColor,
        config.bgColor,
        compact ? "py-0.5 mb-0.5" : "py-1.5 mb-1.5",
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      title="Kliknij, aby przejsc do oryginalnej wiadomosci"
    >
      {/* Thread branch indicator */}
      <CornerDownRight className="w-3 h-3 mt-0.5 flex-shrink-0 text-muted-foreground/30" />

      <div className="min-w-0 flex-1">
        {/* Sender info */}
        <span
          className={cn(
            "font-medium flex items-center gap-1",
            config.textColor,
            compact ? "text-[9px]" : "text-[10px]",
          )}
        >
          <Icon className="w-2.5 h-2.5" />
          {config.label}
        </span>

        {/* Preview text */}
        <p
          className={cn(
            "text-muted-foreground/60 truncate leading-tight",
            compact ? "text-[10px]" : "text-[11px]",
          )}
        >
          {replyTo.preview}
        </p>
      </div>

      {/* Reply icon */}
      <Reply className="w-3 h-3 mt-0.5 flex-shrink-0 text-muted-foreground/20" />
    </div>
  );
}
