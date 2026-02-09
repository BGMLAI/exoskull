"use client";

import type { StreamEvent } from "@/lib/stream/types";
import { UserMessage } from "./events/UserMessage";
import { AIMessage } from "./events/AIMessage";
import { SystemNotification } from "./events/SystemNotification";
import { AgentAction } from "./events/AgentAction";
import { ThinkingIndicator } from "./events/ThinkingIndicator";

import { EmotionCard } from "./events/EmotionCard";
import { InsightCard } from "./events/InsightCard";
import { SessionSummary } from "./events/SessionSummary";

interface StreamEventRouterProps {
  event: StreamEvent;
}

export function StreamEventRouter({ event }: StreamEventRouterProps) {
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
    default:
      return null;
  }
}
