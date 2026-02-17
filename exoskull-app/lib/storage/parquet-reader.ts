/**
 * Parquet Reader for Silver Layer ETL
 * Uses hyparquet for pure JS Parquet reading
 *
 * @see https://github.com/hyparam/hyparquet
 */

import { parquetRead, parquetMetadata, FileMetaData } from "hyparquet";
import { readFromBronze, listBronzeFiles, DataType } from "./r2-client";

import { logger } from "@/lib/logger";
// ============================================================================
// Types
// ============================================================================

export interface ParquetReadResult<T> {
  success: boolean;
  records?: T[];
  metadata?: FileMetaData;
  error?: string;
}

export interface ConversationBronzeRecord {
  id: string;
  tenant_id: string;
  channel: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  summary: string | null;
  context: string;
  insights: string;
  created_at: string;
  updated_at: string;
}

export interface MessageBronzeRecord {
  id: string;
  conversation_id: string;
  tenant_id: string;
  role: string;
  content: string;
  timestamp: string;
  duration_ms: number;
  audio_url: string | null;
  transcription_confidence: number | null;
  context: string;
}

export interface VoiceCallBronzeRecord {
  id: string;
  tenant_id: string;
  vapi_call_id: string;
  phone_number: string | null;
  direction: string;
  status: string;
  duration_seconds: number;
  transcript: string | null;
  audio_url: string | null;
  started_at: string;
  ended_at: string | null;
  metadata: string;
}

export interface SmsLogBronzeRecord {
  id: string;
  tenant_id: string;
  twilio_message_sid: string;
  direction: string;
  from_number: string;
  to_number: string;
  body: string;
  status: string;
  sent_at: string;
  metadata: string;
}

// ============================================================================
// Core Reading Functions
// ============================================================================

/**
 * Read and parse a Parquet file from R2
 */
export async function readParquetFromR2<T>(
  key: string,
): Promise<ParquetReadResult<T>> {
  try {
    // Fetch file from R2
    const result = await readFromBronze(key);
    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || "Failed to read from R2",
      };
    }

    // Create async file interface for hyparquet
    // Note: Buffer.buffer can be SharedArrayBuffer, so we copy to a new ArrayBuffer
    const arrayBuffer = new Uint8Array(result.data).buffer as ArrayBuffer;

    // Get metadata first
    const metadata = parquetMetadata(arrayBuffer);

    // Read all data
    const records: T[] = [];
    await parquetRead({
      file: {
        byteLength: arrayBuffer.byteLength,
        slice: (start: number, end?: number) => {
          return arrayBuffer.slice(start, end) as ArrayBuffer;
        },
      },
      rowFormat: "object",
      onComplete: (data: Record<string, unknown>[]) => {
        records.push(...(data as T[]));
      },
    });

    return {
      success: true,
      records,
      metadata,
    };
  } catch (error) {
    logger.error("[ParquetReader] Failed to read Parquet:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error reading Parquet",
    };
  }
}

/**
 * Read all Parquet files for a data type since a given date
 */
export async function readBronzeFilesSince<T>(params: {
  tenantId: string;
  dataType: DataType;
  since: Date;
}): Promise<{
  success: boolean;
  records: T[];
  files: string[];
  error?: string;
}> {
  try {
    // List all files for this tenant/dataType
    const listResult = await listBronzeFiles({
      tenantId: params.tenantId,
      dataType: params.dataType,
    });

    if (!listResult.success || !listResult.keys) {
      return {
        success: false,
        records: [],
        files: [],
        error: listResult.error,
      };
    }

    // Filter files by date (extract from path: year=YYYY/month=MM/day=DD)
    const sinceYear = params.since.getUTCFullYear();
    const sinceMonth = params.since.getUTCMonth() + 1;
    const sinceDay = params.since.getUTCDate();

    const filteredKeys = listResult.keys.filter((key) => {
      const match = key.match(/year=(\d{4})\/month=(\d{2})\/day=(\d{2})/);
      if (!match) return false;

      const fileYear = parseInt(match[1], 10);
      const fileMonth = parseInt(match[2], 10);
      const fileDay = parseInt(match[3], 10);

      // Compare dates
      if (fileYear > sinceYear) return true;
      if (fileYear < sinceYear) return false;
      if (fileMonth > sinceMonth) return true;
      if (fileMonth < sinceMonth) return false;
      return fileDay >= sinceDay;
    });

    // Read all matching files
    const allRecords: T[] = [];
    const processedFiles: string[] = [];

    for (const key of filteredKeys) {
      const result = await readParquetFromR2<T>(key);
      if (result.success && result.records) {
        allRecords.push(...result.records);
        processedFiles.push(key);
      } else {
        logger.warn(`[ParquetReader] Skipping file ${key}: ${result.error}`);
      }
    }

    return {
      success: true,
      records: allRecords,
      files: processedFiles,
    };
  } catch (error) {
    logger.error("[ParquetReader] Failed to read Bronze files:", error);
    return {
      success: false,
      records: [],
      files: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Type-Specific Readers
// ============================================================================

/**
 * Read conversations from Bronze
 */
export async function readBronzeConversations(params: {
  tenantId: string;
  since: Date;
}): Promise<{
  success: boolean;
  records: ConversationBronzeRecord[];
  files: string[];
  error?: string;
}> {
  return readBronzeFilesSince<ConversationBronzeRecord>({
    tenantId: params.tenantId,
    dataType: "conversations",
    since: params.since,
  });
}

/**
 * Read messages from Bronze
 */
export async function readBronzeMessages(params: {
  tenantId: string;
  since: Date;
}): Promise<{
  success: boolean;
  records: MessageBronzeRecord[];
  files: string[];
  error?: string;
}> {
  return readBronzeFilesSince<MessageBronzeRecord>({
    tenantId: params.tenantId,
    dataType: "messages",
    since: params.since,
  });
}

/**
 * Read voice calls from Bronze
 */
export async function readBronzeVoiceCalls(params: {
  tenantId: string;
  since: Date;
}): Promise<{
  success: boolean;
  records: VoiceCallBronzeRecord[];
  files: string[];
  error?: string;
}> {
  return readBronzeFilesSince<VoiceCallBronzeRecord>({
    tenantId: params.tenantId,
    dataType: "voice_calls",
    since: params.since,
  });
}

/**
 * Read SMS logs from Bronze
 */
export async function readBronzeSmsLogs(params: {
  tenantId: string;
  since: Date;
}): Promise<{
  success: boolean;
  records: SmsLogBronzeRecord[];
  files: string[];
  error?: string;
}> {
  return readBronzeFilesSince<SmsLogBronzeRecord>({
    tenantId: params.tenantId,
    dataType: "sms_logs",
    since: params.since,
  });
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Deduplicate records by ID
 */
export function deduplicateById<T extends { id: string }>(records: T[]): T[] {
  const seen = new Map<string, T>();
  for (const record of records) {
    // Keep latest version (assuming later records are more recent)
    seen.set(record.id, record);
  }
  return Array.from(seen.values());
}

/**
 * Parse ISO timestamp to Date
 */
export function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  try {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/**
 * Safe JSON parse
 */
export function safeJsonParse(
  value: string | null | undefined,
  fallback: unknown = {},
): unknown {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
