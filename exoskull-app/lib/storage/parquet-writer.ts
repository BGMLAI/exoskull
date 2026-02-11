/**
 * Parquet Writer for Bronze Layer
 * Uses hyparquet-writer for pure JS Parquet generation
 *
 * @see https://github.com/hyparam/hyparquet-writer
 */

import { parquetWriteBuffer } from "hyparquet-writer";

// ============================================================================
// Type Definitions
// ============================================================================

export interface ConversationRecord {
  id: string;
  tenant_id: string;
  channel: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  summary: string | null;
  context: string; // JSON string
  insights: string | null; // JSON array string
  created_at: string;
  updated_at: string;
}

export interface MessageRecord {
  id: string;
  conversation_id: string;
  tenant_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  duration_ms: number | null;
  audio_url: string | null;
  transcription_confidence: number | null;
  context: string; // JSON string
}

export interface VoiceCallRecord {
  id: string;
  tenant_id: string;
  vapi_call_id: string;
  phone_number: string | null;
  direction: "inbound" | "outbound";
  status: string;
  duration_seconds: number;
  transcript: string | null;
  audio_url: string | null;
  started_at: string;
  ended_at: string | null;
  metadata: string; // JSON string
}

export interface SmsLogRecord {
  id: string;
  tenant_id: string;
  twilio_message_sid: string;
  direction: "inbound" | "outbound";
  from_number: string;
  to_number: string;
  body: string;
  status: string;
  sent_at: string;
  metadata: string; // JSON string
}

export interface JobLogRecord {
  id: string;
  job_id: string;
  job_name: string;
  tenant_id: string;
  scheduled_at: string;
  executed_at: string | null;
  status: string;
  channel_used: string | null;
  result_payload: string; // JSON string
  error_message: string | null;
}

export interface EmailRecord {
  id: string;
  tenant_id: string;
  account_id: string;
  provider_message_id: string;
  subject: string;
  from_email: string;
  from_name: string;
  to_emails: string; // JSON array string
  date_received: string;
  category: string;
  priority_score: number;
  sentiment: string;
  analysis_status: string;
  action_items: string; // JSON array string
  key_facts: string; // JSON array string
  follow_up_needed: boolean;
  follow_up_by: string;
  is_read: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Parquet Writers
// ============================================================================

/**
 * Convert conversations to Parquet buffer
 */
export function conversationsToParquet(
  conversations: ConversationRecord[],
): Uint8Array {
  if (conversations.length === 0) {
    throw new Error("Cannot create Parquet file with zero records");
  }

  // Build column data for hyparquet-writer (array of ColumnSource objects)
  const columnData = [
    { name: "id", data: conversations.map((c) => c.id) },
    { name: "tenant_id", data: conversations.map((c) => c.tenant_id) },
    { name: "channel", data: conversations.map((c) => c.channel) },
    { name: "started_at", data: conversations.map((c) => c.started_at) },
    { name: "ended_at", data: conversations.map((c) => c.ended_at || "") },
    {
      name: "duration_seconds",
      data: conversations.map((c) => c.duration_seconds || 0),
      type: "INT32" as const,
    },
    { name: "summary", data: conversations.map((c) => c.summary || "") },
    { name: "context", data: conversations.map((c) => c.context) },
    { name: "insights", data: conversations.map((c) => c.insights || "[]") },
    { name: "created_at", data: conversations.map((c) => c.created_at) },
    { name: "updated_at", data: conversations.map((c) => c.updated_at) },
  ];

  // Write to Parquet using parquetWriteBuffer (returns ArrayBuffer)
  const buffer = parquetWriteBuffer({ columnData });
  return new Uint8Array(buffer);
}

/**
 * Convert messages to Parquet buffer
 */
export function messagesToParquet(messages: MessageRecord[]): Uint8Array {
  if (messages.length === 0) {
    throw new Error("Cannot create Parquet file with zero records");
  }

  const columnData = [
    { name: "id", data: messages.map((m) => m.id) },
    { name: "conversation_id", data: messages.map((m) => m.conversation_id) },
    { name: "tenant_id", data: messages.map((m) => m.tenant_id) },
    { name: "role", data: messages.map((m) => m.role) },
    { name: "content", data: messages.map((m) => m.content) },
    { name: "timestamp", data: messages.map((m) => m.timestamp) },
    {
      name: "duration_ms",
      data: messages.map((m) => m.duration_ms || 0),
      type: "INT32" as const,
    },
    { name: "audio_url", data: messages.map((m) => m.audio_url || "") },
    {
      name: "transcription_confidence",
      data: messages.map((m) => m.transcription_confidence || 0),
      type: "FLOAT" as const,
    },
    { name: "context", data: messages.map((m) => m.context) },
  ];

  const buffer = parquetWriteBuffer({ columnData });
  return new Uint8Array(buffer);
}

/**
 * Convert voice calls to Parquet buffer
 */
export function voiceCallsToParquet(calls: VoiceCallRecord[]): Uint8Array {
  if (calls.length === 0) {
    throw new Error("Cannot create Parquet file with zero records");
  }

  const columnData = [
    { name: "id", data: calls.map((c) => c.id) },
    { name: "tenant_id", data: calls.map((c) => c.tenant_id) },
    { name: "vapi_call_id", data: calls.map((c) => c.vapi_call_id) },
    { name: "phone_number", data: calls.map((c) => c.phone_number || "") },
    { name: "direction", data: calls.map((c) => c.direction) },
    { name: "status", data: calls.map((c) => c.status) },
    {
      name: "duration_seconds",
      data: calls.map((c) => c.duration_seconds),
      type: "INT32" as const,
    },
    { name: "transcript", data: calls.map((c) => c.transcript || "") },
    { name: "audio_url", data: calls.map((c) => c.audio_url || "") },
    { name: "started_at", data: calls.map((c) => c.started_at) },
    { name: "ended_at", data: calls.map((c) => c.ended_at || "") },
    { name: "metadata", data: calls.map((c) => c.metadata) },
  ];

  const buffer = parquetWriteBuffer({ columnData });
  return new Uint8Array(buffer);
}

/**
 * Convert SMS logs to Parquet buffer
 */
export function smsLogsToParquet(logs: SmsLogRecord[]): Uint8Array {
  if (logs.length === 0) {
    throw new Error("Cannot create Parquet file with zero records");
  }

  const columnData = [
    { name: "id", data: logs.map((l) => l.id) },
    { name: "tenant_id", data: logs.map((l) => l.tenant_id) },
    { name: "twilio_message_sid", data: logs.map((l) => l.twilio_message_sid) },
    { name: "direction", data: logs.map((l) => l.direction) },
    { name: "from_number", data: logs.map((l) => l.from_number) },
    { name: "to_number", data: logs.map((l) => l.to_number) },
    { name: "body", data: logs.map((l) => l.body) },
    { name: "status", data: logs.map((l) => l.status) },
    { name: "sent_at", data: logs.map((l) => l.sent_at) },
    { name: "metadata", data: logs.map((l) => l.metadata) },
  ];

  const buffer = parquetWriteBuffer({ columnData });
  return new Uint8Array(buffer);
}

/**
 * Convert job logs to Parquet buffer
 */
export function jobLogsToParquet(logs: JobLogRecord[]): Uint8Array {
  if (logs.length === 0) {
    throw new Error("Cannot create Parquet file with zero records");
  }

  const columnData = [
    { name: "id", data: logs.map((l) => l.id) },
    { name: "job_id", data: logs.map((l) => l.job_id) },
    { name: "job_name", data: logs.map((l) => l.job_name) },
    { name: "tenant_id", data: logs.map((l) => l.tenant_id) },
    { name: "scheduled_at", data: logs.map((l) => l.scheduled_at) },
    { name: "executed_at", data: logs.map((l) => l.executed_at || "") },
    { name: "status", data: logs.map((l) => l.status) },
    { name: "channel_used", data: logs.map((l) => l.channel_used || "") },
    { name: "result_payload", data: logs.map((l) => l.result_payload) },
    { name: "error_message", data: logs.map((l) => l.error_message || "") },
  ];

  const buffer = parquetWriteBuffer({ columnData });
  return new Uint8Array(buffer);
}

/**
 * Convert analyzed emails to Parquet buffer
 */
export function emailsToParquet(emails: EmailRecord[]): Uint8Array {
  if (emails.length === 0) {
    throw new Error("Cannot create Parquet file with zero records");
  }

  const columnData = [
    { name: "id", data: emails.map((e) => e.id) },
    { name: "tenant_id", data: emails.map((e) => e.tenant_id) },
    { name: "account_id", data: emails.map((e) => e.account_id) },
    {
      name: "provider_message_id",
      data: emails.map((e) => e.provider_message_id),
    },
    { name: "subject", data: emails.map((e) => e.subject) },
    { name: "from_email", data: emails.map((e) => e.from_email) },
    { name: "from_name", data: emails.map((e) => e.from_name) },
    { name: "to_emails", data: emails.map((e) => e.to_emails) },
    { name: "date_received", data: emails.map((e) => e.date_received) },
    { name: "category", data: emails.map((e) => e.category) },
    {
      name: "priority_score",
      data: emails.map((e) => e.priority_score),
      type: "INT32" as const,
    },
    { name: "sentiment", data: emails.map((e) => e.sentiment) },
    { name: "analysis_status", data: emails.map((e) => e.analysis_status) },
    { name: "action_items", data: emails.map((e) => e.action_items) },
    { name: "key_facts", data: emails.map((e) => e.key_facts) },
    {
      name: "follow_up_needed",
      data: emails.map((e) => (e.follow_up_needed ? 1 : 0)),
      type: "INT32" as const,
    },
    { name: "follow_up_by", data: emails.map((e) => e.follow_up_by || "") },
    {
      name: "is_read",
      data: emails.map((e) => (e.is_read ? 1 : 0)),
      type: "INT32" as const,
    },
    { name: "created_at", data: emails.map((e) => e.created_at) },
    { name: "updated_at", data: emails.map((e) => e.updated_at) },
  ];

  const buffer = parquetWriteBuffer({ columnData });
  return new Uint8Array(buffer);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Estimate Parquet file size for a set of records
 * Useful for batching decisions
 */
export function estimateParquetSize(
  records: unknown[],
  avgRecordBytes: number = 500,
): number {
  // Parquet typically achieves 3-5x compression for text data
  // Adding overhead for metadata (~1KB per file)
  const rawSize = records.length * avgRecordBytes;
  const compressedSize = rawSize / 4; // ~75% compression estimate
  return Math.ceil(compressedSize + 1024);
}

/**
 * Chunk records for optimal Parquet file sizes
 * Target: 10MB-100MB files for good query performance
 */
export function chunkRecords<T>(
  records: T[],
  targetSizeBytes: number = 50 * 1024 * 1024,
): T[][] {
  if (records.length === 0) return [];

  // Estimate size per record
  const sampleSize = Math.min(100, records.length);
  const sampleBytes = JSON.stringify(records.slice(0, sampleSize)).length;
  const avgRecordBytes = sampleBytes / sampleSize;

  // Calculate records per chunk
  const recordsPerChunk = Math.max(
    1,
    Math.floor(targetSizeBytes / avgRecordBytes),
  );

  const chunks: T[][] = [];
  for (let i = 0; i < records.length; i += recordsPerChunk) {
    chunks.push(records.slice(i, i + recordsPerChunk));
  }

  return chunks;
}
