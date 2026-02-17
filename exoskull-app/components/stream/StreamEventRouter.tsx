"use client";

import { useState } from "react";
import { Reply } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent } from "@/lib/stream/types";
import { getNotificationCategory, CATEGORY_COLORS } from "@/lib/stream/types";
import { UserMessage } from "./events/UserMessage";
import { AIMessage } from "./events/AIMessage";
import { SystemNotification } from "./events/SystemNotification";
import { AgentAction } from "./events/AgentAction";
import { ThinkingIndicator } from "./events/ThinkingIndicator";

import { EmotionCard } from "./events/EmotionCard";
import { InsightCard } from "./events/InsightCard";
import { SessionSummary } from "./events/SessionSummary";

// Chat Rzeka — event components
import { ChannelMessage } from "./events/ChannelMessage";
import { CallTranscript } from "./events/CallTranscript";
import { FileUploadEvent } from "./events/FileUploadEvent";
import { ThirdPartyAction } from "./events/ThirdPartyAction";
import { AgentComm } from "./events/AgentComm";
import { KnowledgeCitation } from "./events/KnowledgeCitation";
import { SystemEvolution } from "./events/SystemEvolution";
import { QuotedReply } from "./events/QuotedReply";

// New Workstream B components
import { CodeBlock } from "./events/CodeBlock";
import { MediaContent } from "./events/MediaContent";
import { ToolExecution } from "./events/ToolExecution";

// Rich content components (Gemini/Perplexity-style)
import { SearchResultsEvent } from "./events/SearchResultsEvent";
import { RichContentEvent } from "./events/RichContentEvent";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StreamEventRouterProps {
  event: StreamEvent;
  onReply?: (event: StreamEvent) => void;
}

// ---------------------------------------------------------------------------
// Event content renderer
// ---------------------------------------------------------------------------

function EventContent({ event }: { event: StreamEvent }) {
  switch (event.data.type) {
    case "user_message":
    case "user_voice":
      return <UserMessage event={event} />;
    case "ai_message":
      return <AIMessage event={event} />;
    case "system_notification":
      return <SystemNotification event={event} />;
    case "agent_action":
      return <AgentAction event={event} />;
    case "thinking_step":
      return <ThinkingIndicator event={event} />;
    case "emotion_reading":
      return <EmotionCard event={event} />;
    case "insight_card":
      return <InsightCard event={event} />;
    case "session_summary":
      return <SessionSummary event={event} />;
    // Chat Rzeka events
    case "channel_message":
      return <ChannelMessage event={event} />;
    case "call_transcript":
      return <CallTranscript event={event} />;
    case "file_upload":
      return <FileUploadEvent event={event} />;
    case "third_party_action":
      return <ThirdPartyAction event={event} />;
    case "agent_communication":
      return <AgentComm event={event} />;
    case "knowledge_citation":
      return <KnowledgeCitation event={event} />;
    case "system_evolution":
      return <SystemEvolution event={event} />;
    // Workstream B — new event types
    case "code_block":
      return <CodeBlock event={event} />;
    case "media_content":
      return <MediaContent event={event} />;
    case "tool_execution":
      return <ToolExecution event={event} />;
    case "search_results":
      return <SearchResultsEvent event={event} />;
    case "rich_content":
      return <RichContentEvent event={event} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Types that support replying (user-facing messages)
// ---------------------------------------------------------------------------

const REPLYABLE_TYPES = new Set([
  "user_message",
  "user_voice",
  "ai_message",
  "channel_message",
]);

// ---------------------------------------------------------------------------
// Types that manage their own border styling (skip category border)
// ---------------------------------------------------------------------------

const SELF_BORDERED_TYPES = new Set([
  "channel_message",
  "system_evolution",
  "insight_card",
  "code_block",
  "media_content",
  "tool_execution",
  "thinking_step",
  "user_message",
  "user_voice",
  "ai_message",
  "emotion_reading",
  "search_results",
  "rich_content",
]);

// ---------------------------------------------------------------------------
// Router — main entry point for rendering stream events
// ---------------------------------------------------------------------------

export function StreamEventRouter({ event, onReply }: StreamEventRouterProps) {
  const [hovered, setHovered] = useState(false);

  // Get notification category for color-coding
  const category = getNotificationCategory(event.data);
  const categoryColors = CATEGORY_COLORS[category];

  const canReply = REPLYABLE_TYPES.has(event.data.type) && !!onReply;
  const selfBordered = SELF_BORDERED_TYPES.has(event.data.type);

  // Thread indentation for reply chains
  const isReply = !!event.replyTo;

  return (
    <div
      id={`stream-event-${event.id}`}
      className={cn(
        "group relative transition-colors duration-150",
        // Thread indentation for replies
        isReply && "ml-4 relative",
        // Category-based left border (only for non-self-bordered)
        !selfBordered && "border-l-2 pl-2.5 rounded-sm",
        !selfBordered && categoryColors.border,
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thread connector line for replies */}
      {isReply && (
        <div className="absolute -left-4 top-0 w-4 h-5 border-l-2 border-b-2 border-border/30 rounded-bl-lg" />
      )}

      {/* Quoted reply block (thread branching) */}
      {event.replyTo && <QuotedReply replyTo={event.replyTo} />}

      {/* Event content */}
      <EventContent event={event} />

      {/* Reply button (shown on hover for replyable events) */}
      {canReply && hovered && (
        <button
          onClick={() => onReply(event)}
          className={cn(
            "absolute -right-1 top-1 p-1.5 rounded-full shadow-sm border transition-all",
            "opacity-0 group-hover:opacity-100",
            "bg-card hover:bg-muted text-muted-foreground hover:text-foreground",
            "border-border/50 hover:border-border",
          )}
          title="Odpowiedz"
        >
          <Reply className="w-3 h-3" />
        </button>
      )}

      {/* Category color indicator dot (for self-bordered events) */}
      {selfBordered &&
        !isReply &&
        event.data.type !== "user_message" &&
        event.data.type !== "user_voice" &&
        event.data.type !== "ai_message" && (
          <div
            className={cn(
              "absolute -left-1 top-3 w-2 h-2 rounded-full opacity-60",
              category === "system" && "bg-gray-400",
              category === "ai_insight" && "bg-purple-500",
              category === "task" && "bg-blue-500",
              category === "alert" && "bg-red-500",
              category === "integration" && "bg-green-500",
              category === "voice" && "bg-amber-500",
              category === "evolution" && "bg-teal-500",
            )}
          />
        )}
    </div>
  );
}
