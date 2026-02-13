/**
 * Unified Activity Stream — Type Definitions
 *
 * All event types that can appear in the unified stream.
 * No new DB tables — events are composed from:
 *   exo_unified_messages, exo_activity_log, exo_emotion_signals, exo_insight_deliveries
 */

// ---------------------------------------------------------------------------
// Stream Event (top-level)
// ---------------------------------------------------------------------------

export interface StreamEvent {
  id: string;
  timestamp: Date;
  data: StreamEventData;
}

// Discriminated union on `type` field
export type StreamEventData =
  | UserMessageData
  | UserVoiceData
  | AIMessageData
  | AgentActionData
  | ThinkingStepData
  | EmotionReadingData
  | SystemNotificationData
  | InsightCardData
  | SessionSummaryData
  | ChannelMessageData
  | CallTranscriptData
  | FileUploadData
  | ThirdPartyActionData
  | AgentCommunicationData
  | KnowledgeCitationData
  | SystemEvolutionData;

// ---------------------------------------------------------------------------
// Message events
// ---------------------------------------------------------------------------

export interface UserMessageData {
  type: "user_message";
  content: string;
}

export interface UserVoiceData {
  type: "user_voice";
  transcript: string;
  durationMs?: number;
}

export interface AIMessageData {
  type: "ai_message";
  content: string;
  isStreaming: boolean;
  toolsUsed?: string[];
}

// ---------------------------------------------------------------------------
// AI transparency events
// ---------------------------------------------------------------------------

export interface AgentActionData {
  type: "agent_action";
  toolName: string;
  displayLabel: string;
  status: "running" | "done" | "error";
  durationMs?: number;
}

export interface ThinkingStepData {
  type: "thinking_step";
  steps: ThinkingStep[];
  toolActions?: ToolAction[];
}

export interface ThinkingStep {
  label: string;
  status: "pending" | "running" | "done";
  detail?: string;
}

export interface ToolAction {
  toolName: string;
  displayLabel: string;
  status: "running" | "done" | "error";
  durationMs?: number;
  resultSummary?: string;
  success?: boolean;
}

// ---------------------------------------------------------------------------
// Context events
// ---------------------------------------------------------------------------

export interface EmotionReadingData {
  type: "emotion_reading";
  quadrant: "known_want" | "known_unwant" | "unknown_want" | "unknown_unwant";
  primaryEmotion: string;
  intensity: number;
  valence: number;
}

export interface SystemNotificationData {
  type: "system_notification";
  message: string;
  severity: "info" | "success" | "warning";
}

export interface InsightCardData {
  type: "insight_card";
  title: string;
  body: string;
  source: string;
  score?: number;
}

export interface SessionSummaryData {
  type: "session_summary";
  topics: string[];
  toolsUsed: string[];
  emotionSummary?: string;
  duration: string;
}

// ---------------------------------------------------------------------------
// Chat Rzeka — channel & cross-system events
// ---------------------------------------------------------------------------

export type ChannelType =
  | "sms"
  | "whatsapp"
  | "telegram"
  | "discord"
  | "signal"
  | "imessage"
  | "email"
  | "slack"
  | "messenger"
  | "instagram"
  | "web_chat"
  | "voice";

export interface ChannelMessageData {
  type: "channel_message";
  channel: ChannelType;
  direction: "inbound" | "outbound";
  content: string;
  senderName?: string;
  from?: string;
}

export interface CallTranscriptData {
  type: "call_transcript";
  direction: "inbound" | "outbound";
  callerName?: string;
  callerPhone?: string;
  transcript: string;
  durationSec?: number;
  recordingUrl?: string;
}

export interface FileUploadData {
  type: "file_upload";
  filename: string;
  fileType: string;
  fileSize: number;
  status: "uploading" | "processing" | "ready" | "failed";
  documentId?: string;
  chunks?: number;
}

export interface ThirdPartyActionData {
  type: "third_party_action";
  service: string;
  action: string;
  resultSummary: string;
  success: boolean;
}

export interface AgentCommunicationData {
  type: "agent_communication";
  agentName: string;
  targetName?: string;
  content: string;
}

export interface KnowledgeCitationData {
  type: "knowledge_citation";
  documentName: string;
  documentId: string;
  snippet: string;
  relevanceScore: number;
}

// ---------------------------------------------------------------------------
// System Evolution events (Ralph Loop)
// ---------------------------------------------------------------------------

export interface SystemEvolutionData {
  type: "system_evolution";
  evolutionType: "build" | "fix" | "optimize" | "register_tool";
  title: string;
  description: string;
  outcome: "success" | "failed" | "pending";
  relatedEntity?: string;
  journalEntryId?: string;
}

// ---------------------------------------------------------------------------
// SSE event types (from /api/chat/stream)
// ---------------------------------------------------------------------------

export type SSEEventType =
  | "session"
  | "status"
  | "thinking_step"
  | "tool_start"
  | "tool_end"
  | "delta"
  | "done"
  | "error";
