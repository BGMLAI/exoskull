"use client";

import { useState, useCallback, useMemo } from "react";
import {
  GitBranch,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  X,
  User,
  Bot,
  Cog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent } from "@/lib/stream/types";
import { StreamEventRouter } from "./StreamEventRouter";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ThreadBranchProps {
  /** The parent event that has replies */
  parentEvent: StreamEvent;
  /** All reply events (events where replyTo.id === parentEvent.id) */
  replies: StreamEvent[];
  /** Handler for replying to a message */
  onReply?: (event: StreamEvent) => void;
}

// ---------------------------------------------------------------------------
// Thread context line — vertical connector
// ---------------------------------------------------------------------------

function ThreadLine({ depth = 0 }: { depth?: number }) {
  return (
    <div
      className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-primary/30 via-primary/15 to-transparent"
      style={{ left: `${12 + depth * 16}px` }}
    />
  );
}

// ---------------------------------------------------------------------------
// Role config
// ---------------------------------------------------------------------------

const ROLE_CONFIG = {
  user: { icon: User, label: "Ty", color: "text-primary" },
  ai: { icon: Bot, label: "ExoSkull", color: "text-muted-foreground" },
  system: { icon: Cog, label: "System", color: "text-amber-500" },
} as const;

function getSenderRole(event: StreamEvent): "user" | "ai" | "system" {
  const t = event.data.type;
  if (t === "user_message" || t === "user_voice") return "user";
  if (t === "ai_message") return "ai";
  return "system";
}

// ---------------------------------------------------------------------------
// Thread sidebar panel (Slack-like)
// ---------------------------------------------------------------------------

interface ThreadSidebarProps {
  parentEvent: StreamEvent;
  replies: StreamEvent[];
  onClose: () => void;
  onReply?: (event: StreamEvent) => void;
}

export function ThreadSidebar({
  parentEvent,
  replies,
  onClose,
  onReply,
}: ThreadSidebarProps) {
  const role = getSenderRole(parentEvent);
  const config = ROLE_CONFIG[role];

  return (
    <div className="flex flex-col h-full border-l bg-card w-[360px] max-w-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-muted/30">
        <GitBranch className="w-4 h-4 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium">Wątek</span>
          <span className="text-[10px] text-muted-foreground/60 ml-1.5">
            {replies.length}{" "}
            {replies.length === 1
              ? "odpowiedź"
              : replies.length < 5
                ? "odpowiedzi"
                : "odpowiedzi"}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Parent message */}
      <div className="px-3 py-2 border-b border-border/50 bg-muted/10">
        <StreamEventRouter event={parentEvent} onReply={onReply} />
      </div>

      {/* Replies */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {replies.map((reply) => (
          <div key={reply.id} className="relative pl-4">
            {/* Thread connector line */}
            <div className="absolute left-1 top-0 bottom-0 w-px bg-border/30" />
            <div className="absolute left-0 top-3 w-2.5 h-px bg-border/30" />
            <StreamEventRouter event={reply} onReply={onReply} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline thread indicator (shows in stream when event has replies)
// ---------------------------------------------------------------------------

interface ThreadIndicatorProps {
  parentEvent: StreamEvent;
  replyCount: number;
  lastReplyRole?: "user" | "ai" | "system";
  onClick: () => void;
}

export function ThreadIndicator({
  parentEvent,
  replyCount,
  lastReplyRole,
  onClick,
}: ThreadIndicatorProps) {
  if (replyCount === 0) return null;

  const roleConfig = lastReplyRole
    ? ROLE_CONFIG[lastReplyRole]
    : ROLE_CONFIG.ai;
  const RoleIcon = roleConfig.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 mt-1 px-2 py-1 rounded-md",
        "text-primary/70 hover:text-primary hover:bg-primary/5",
        "transition-all duration-150 group",
      )}
    >
      <MessageSquare className="w-3 h-3" />
      <span className="text-[11px] font-medium">
        {replyCount}{" "}
        {replyCount === 1
          ? "odpowiedź"
          : replyCount < 5
            ? "odpowiedzi"
            : "odpowiedzi"}
      </span>
      <RoleIcon className={cn("w-2.5 h-2.5 opacity-50", roleConfig.color)} />
      <ChevronRight className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main ThreadBranch component — inline expandable thread
// ---------------------------------------------------------------------------

export function ThreadBranch({
  parentEvent,
  replies,
  onReply,
}: ThreadBranchProps) {
  const [expanded, setExpanded] = useState(false);

  const lastReply = replies[replies.length - 1];
  const lastReplyRole = lastReply ? getSenderRole(lastReply) : undefined;

  if (replies.length === 0) return null;

  return (
    <div className="relative">
      {/* Thread indicator */}
      {!expanded && (
        <ThreadIndicator
          parentEvent={parentEvent}
          replyCount={replies.length}
          lastReplyRole={lastReplyRole}
          onClick={() => setExpanded(true)}
        />
      )}

      {/* Expanded inline thread */}
      {expanded && (
        <div className="relative mt-1.5 ml-3 border-l-2 border-primary/20 pl-3">
          {/* Collapse button */}
          <button
            onClick={() => setExpanded(false)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground mb-1.5 transition-colors"
          >
            <ChevronDown className="w-2.5 h-2.5" />
            <span>Ukryj wątek ({replies.length})</span>
          </button>

          {/* Reply events */}
          <div className="space-y-1.5">
            {replies.map((reply, i) => (
              <div key={reply.id} className="relative">
                {/* Horizontal connector */}
                <div className="absolute -left-3 top-3 w-2.5 h-px bg-primary/15" />
                <StreamEventRouter event={reply} onReply={onReply} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
