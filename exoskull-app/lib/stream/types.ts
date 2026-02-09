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
  | SessionSummaryData;

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
}

export interface ThinkingStep {
  label: string;
  status: "pending" | "running" | "done";
  detail?: string;
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
