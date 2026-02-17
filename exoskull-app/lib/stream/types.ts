/**
 * Unified Activity Stream — Type Definitions
 *
 * All event types that can appear in the unified stream.
 * No new DB tables — events are composed from:
 *   exo_unified_messages, exo_activity_log, exo_emotion_signals, exo_insight_deliveries
 */

// ---------------------------------------------------------------------------
// Notification category — drives color-coding across the stream
// ---------------------------------------------------------------------------

export type NotificationCategory =
  | "system" // gray — internal system events
  | "ai_insight" // purple — AI-generated insights, emotions
  | "task" // blue — agent actions, tool executions
  | "alert" // red — warnings, errors, critical
  | "integration" // green — third-party, channel, call events
  | "voice" // yellow/amber — voice calls, transcripts
  | "evolution"; // teal — system self-modification (Ralph Loop)

// ---------------------------------------------------------------------------
// Stream Event (top-level)
// ---------------------------------------------------------------------------

export interface StreamEvent {
  id: string;
  timestamp: Date;
  data: StreamEventData;
  /** Thread branching: reference to the message this event is replying to */
  replyTo?: {
    id: string;
    /** Preview of the original message content (first ~100 chars) */
    preview: string;
    /** Role of the original message sender */
    senderRole: "user" | "ai" | "system";
  };
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
  | SystemEvolutionData
  | CodeBlockData
  | MediaContentData
  | ToolExecutionData
  | IngestionReportData;

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
  /** Timestamp when thinking started */
  startedAt?: number;
  /** Whether the entire thinking process is complete */
  isComplete?: boolean;
}

export interface ThinkingStep {
  label: string;
  status: "pending" | "running" | "done";
  detail?: string;
  /** Timestamp when this step started */
  startedAt?: number;
  /** Timestamp when this step completed */
  completedAt?: number;
  /** Nested sub-steps (for deep reasoning chains) */
  subSteps?: ThinkingStep[];
}

export interface ToolAction {
  toolName: string;
  displayLabel: string;
  status: "running" | "done" | "error";
  durationMs?: number;
  resultSummary?: string;
  success?: boolean;
  /** Tool input preview (truncated) */
  inputPreview?: string;
  /** Tool output preview (truncated) */
  outputPreview?: string;
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
// Code Block events — interactive code display in stream
// ---------------------------------------------------------------------------

export interface CodeBlockData {
  type: "code_block";
  language: string;
  code: string;
  filename?: string;
  /** Whether code can be executed (e.g. shell commands) */
  executable?: boolean;
  /** Highlight specific lines (1-indexed) */
  highlightLines?: number[];
}

// ---------------------------------------------------------------------------
// Media Content events — images, videos, documents inline
// ---------------------------------------------------------------------------

export interface MediaContentData {
  type: "media_content";
  mediaType: "image" | "video" | "document" | "audio";
  url: string;
  title?: string;
  caption?: string;
  /** MIME type for proper rendering */
  mimeType?: string;
  /** File size in bytes */
  fileSize?: number;
  /** Thumbnail URL for preview */
  thumbnailUrl?: string;
  /** Width x Height for images/videos */
  dimensions?: { width: number; height: number };
}

// ---------------------------------------------------------------------------
// Tool Execution events — live view of tool running (standalone)
// ---------------------------------------------------------------------------

export interface ToolExecutionData {
  type: "tool_execution";
  toolName: string;
  displayLabel: string;
  status: "queued" | "running" | "done" | "error";
  /** Input parameters preview */
  inputPreview?: string;
  /** Output/result preview */
  outputPreview?: string;
  durationMs?: number;
  /** Progress 0-100 for long-running tools */
  progress?: number;
  /** Logs emitted during execution */
  logs?: string[];
}

// ---------------------------------------------------------------------------
// Ingestion Report events — knowledge pipeline progress + results
// ---------------------------------------------------------------------------

export interface IngestionReportData {
  type: "ingestion_report";
  /** Ingestion job ID for tracking */
  jobId: string;
  /** Source name (filename, URL, etc.) */
  sourceName: string;
  /** Source type */
  sourceType: "document" | "url" | "conversation" | "email" | "voice" | "bulk";
  /** Current pipeline status */
  status:
    | "pending"
    | "extracting"
    | "chunking"
    | "embedding"
    | "graph_extracting"
    | "completed"
    | "failed";
  /** Current step label */
  stepLabel: string;
  /** Progress 0-100 */
  progress: number;
  /** Results (populated when completed) */
  results?: {
    textLength: number;
    chunksCreated: number;
    embeddingsStored: number;
    duplicatesSkipped: number;
    entitiesExtracted: number;
    relationshipsExtracted: number;
    processingTimeMs: number;
  };
  /** Error message (populated when failed) */
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Notification category resolver — maps event type to category
// ---------------------------------------------------------------------------

export function getNotificationCategory(
  data: StreamEventData,
): NotificationCategory {
  switch (data.type) {
    case "system_notification":
      return data.severity === "warning" ? "alert" : "system";
    case "ai_message":
    case "insight_card":
    case "emotion_reading":
      return "ai_insight";
    case "agent_action":
    case "thinking_step":
    case "tool_execution":
      return "task";
    case "third_party_action":
    case "channel_message":
      return "integration";
    case "call_transcript":
    case "user_voice":
      return "voice";
    case "system_evolution":
      return "evolution";
    case "ingestion_report":
      return data.status === "failed" ? "alert" : "task";
    default:
      return "system";
  }
}

// ---------------------------------------------------------------------------
// Category color mapping — CSS classes for each notification category
// ---------------------------------------------------------------------------

export const CATEGORY_COLORS: Record<
  NotificationCategory,
  { border: string; bg: string; text: string; icon: string }
> = {
  system: {
    border: "border-l-gray-400 dark:border-l-gray-500",
    bg: "bg-gray-50 dark:bg-gray-900/30",
    text: "text-gray-600 dark:text-gray-400",
    icon: "text-gray-500",
  },
  ai_insight: {
    border: "border-l-purple-500 dark:border-l-purple-400",
    bg: "bg-purple-50 dark:bg-purple-900/20",
    text: "text-purple-700 dark:text-purple-300",
    icon: "text-purple-500",
  },
  task: {
    border: "border-l-blue-500 dark:border-l-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    text: "text-blue-700 dark:text-blue-300",
    icon: "text-blue-500",
  },
  alert: {
    border: "border-l-red-500 dark:border-l-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
    text: "text-red-700 dark:text-red-300",
    icon: "text-red-500",
  },
  integration: {
    border: "border-l-green-500 dark:border-l-green-400",
    bg: "bg-green-50 dark:bg-green-900/20",
    text: "text-green-700 dark:text-green-300",
    icon: "text-green-500",
  },
  voice: {
    border: "border-l-amber-500 dark:border-l-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    text: "text-amber-700 dark:text-amber-300",
    icon: "text-amber-500",
  },
  evolution: {
    border: "border-l-teal-500 dark:border-l-teal-400",
    bg: "bg-teal-50 dark:bg-teal-900/20",
    text: "text-teal-700 dark:text-teal-300",
    icon: "text-teal-500",
  },
};

// ---------------------------------------------------------------------------
// SSE event types (from /api/chat/stream)
// ---------------------------------------------------------------------------

export type SSEEventType =
  | "session"
  | "status"
  | "thinking_step"
  | "thinking_token"
  | "thinking_done"
  | "tool_start"
  | "tool_end"
  | "delta"
  | "done"
  | "error"
  | "code_block"
  | "media_content"
  | "tool_execution"
  | "ingestion_report"
  | "cockpit_update"
  // Multi-agent events (from VPS agent backend)
  | "delegation"
  | "agent_start"
  | "agent_delta"
  | "agent_end"
  | "agent_handoff"
  | "mcp_tool_start"
  | "mcp_tool_end";
