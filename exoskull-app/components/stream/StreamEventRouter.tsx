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

// Chat Rzeka — new event components
import { ChannelMessage } from "./events/ChannelMessage";
import { CallTranscript } from "./events/CallTranscript";
import { FileUploadEvent } from "./events/FileUploadEvent";
import { ThirdPartyAction } from "./events/ThirdPartyAction";
import { AgentComm } from "./events/AgentComm";
import { KnowledgeCitation } from "./events/KnowledgeCitation";
import { SystemEvolution } from "./events/SystemEvolution";

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
    default:
      return null;
  }
}
