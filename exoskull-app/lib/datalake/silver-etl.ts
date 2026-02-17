/**
 * Silver Layer ETL
 * Transforms Bronze (R2 Parquet) → Silver (Supabase Postgres)
 *
 * Transformations:
 * - Deduplicate by ID
 * - Validate schema
 * - Parse JSON strings → JSONB
 * - Normalize timestamps to UTC
 */

import {
  readBronzeConversations,
  readBronzeMessages,
  readBronzeVoiceCalls,
  readBronzeSmsLogs,
  deduplicateById,
  parseTimestamp,
  safeJsonParse,
  ConversationBronzeRecord,
  MessageBronzeRecord,
  VoiceCallBronzeRecord,
  SmsLogBronzeRecord,
} from "../storage/parquet-reader";
import { DataType } from "../storage/r2-client";
import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
// ============================================================================
// Supabase Client
// ============================================================================

// Single client for public schema (all tables use exo_silver_ prefix)
// ============================================================================
// Types
// ============================================================================

export interface ETLResult {
  dataType: DataType;
  success: boolean;
  recordsProcessed: number;
  recordsInserted: number;
  recordsUpdated: number;
  filesProcessed: string[];
  errors: string[];
}

export interface ETLSummary {
  startedAt: Date;
  completedAt: Date;
  tenants: string[];
  results: ETLResult[];
  totalRecords: number;
  totalErrors: number;
}

// ============================================================================
// Sync Log Management
// ============================================================================

async function getLastSyncTime(
  tenantId: string,
  dataType: DataType,
): Promise<Date> {
  const { data, error } = await getServiceSupabase()
    .from("exo_silver_sync_log")
    .select("last_sync_at")
    .eq("tenant_id", tenantId)
    .eq("data_type", dataType)
    .single();

  if (error || !data) {
    // Default to 30 days ago if no sync record
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return thirtyDaysAgo;
  }

  return new Date(data.last_sync_at);
}

async function updateSyncLog(
  tenantId: string,
  dataType: DataType,
  filesProcessed: string[],
  recordsSynced: number,
  errors: string[],
): Promise<void> {
  const now = new Date().toISOString();

  // Get existing record
  const { data: existing } = await getServiceSupabase()
    .from("exo_silver_sync_log")
    .select("id, bronze_files_processed")
    .eq("tenant_id", tenantId)
    .eq("data_type", dataType)
    .single();

  if (existing) {
    // Update existing
    const allFiles = [
      ...new Set([
        ...(existing.bronze_files_processed || []),
        ...filesProcessed,
      ]),
    ];
    await getServiceSupabase()
      .from("exo_silver_sync_log")
      .update({
        last_sync_at: now,
        records_synced: recordsSynced,
        bronze_files_processed: allFiles,
        errors: errors.slice(-10), // Keep last 10 errors
        updated_at: now,
      })
      .eq("id", existing.id);
  } else {
    // Insert new
    await getServiceSupabase().from("exo_silver_sync_log").insert({
      tenant_id: tenantId,
      data_type: dataType,
      last_sync_at: now,
      records_synced: recordsSynced,
      bronze_files_processed: filesProcessed,
      errors: errors,
    });
  }
}

// ============================================================================
// Transformation Functions
// ============================================================================

interface SilverConversation {
  id: string;
  tenant_id: string;
  channel: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  summary: string | null;
  context: object;
  insights: unknown[];
  synced_at: string;
  bronze_source: string | null;
}

function transformConversation(
  record: ConversationBronzeRecord,
  bronzeSource: string | null,
): SilverConversation {
  return {
    id: record.id,
    tenant_id: record.tenant_id,
    channel: validateChannel(record.channel),
    started_at: normalizeTimestamp(record.started_at),
    ended_at: record.ended_at ? normalizeTimestamp(record.ended_at) : null,
    duration_seconds: record.duration_seconds || 0,
    summary: record.summary || null,
    context: safeJsonParse(record.context, {}) as object,
    insights: safeJsonParse(record.insights, []) as unknown[],
    synced_at: new Date().toISOString(),
    bronze_source: bronzeSource,
  };
}

interface SilverMessage {
  id: string;
  conversation_id: string;
  tenant_id: string;
  role: string;
  content: string;
  timestamp: string;
  duration_ms: number;
  audio_url: string | null;
  transcription_confidence: number | null;
  context: object;
  synced_at: string;
}

function transformMessage(record: MessageBronzeRecord): SilverMessage {
  return {
    id: record.id,
    conversation_id: record.conversation_id,
    tenant_id: record.tenant_id,
    role: validateRole(record.role),
    content: record.content || "",
    timestamp: normalizeTimestamp(record.timestamp),
    duration_ms: record.duration_ms || 0,
    audio_url: record.audio_url || null,
    transcription_confidence: record.transcription_confidence ?? null,
    context: safeJsonParse(record.context, {}) as object,
    synced_at: new Date().toISOString(),
  };
}

interface SilverVoiceCall {
  id: string;
  tenant_id: string;
  vapi_call_id: string | null;
  phone_number: string | null;
  direction: string;
  status: string;
  duration_seconds: number;
  transcript: string | null;
  audio_url: string | null;
  started_at: string;
  ended_at: string | null;
  metadata: object;
  synced_at: string;
}

function transformVoiceCall(record: VoiceCallBronzeRecord): SilverVoiceCall {
  return {
    id: record.id,
    tenant_id: record.tenant_id,
    vapi_call_id: record.vapi_call_id || null,
    phone_number: record.phone_number || null,
    direction: validateDirection(record.direction),
    status: record.status || "unknown",
    duration_seconds: record.duration_seconds || 0,
    transcript: record.transcript || null,
    audio_url: record.audio_url || null,
    started_at: normalizeTimestamp(record.started_at),
    ended_at: record.ended_at ? normalizeTimestamp(record.ended_at) : null,
    metadata: safeJsonParse(record.metadata, {}) as object,
    synced_at: new Date().toISOString(),
  };
}

interface SilverSmsLog {
  id: string;
  tenant_id: string;
  twilio_message_sid: string | null;
  direction: string;
  from_number: string;
  to_number: string;
  body: string;
  status: string;
  sent_at: string;
  metadata: object;
  synced_at: string;
}

function transformSmsLog(record: SmsLogBronzeRecord): SilverSmsLog {
  return {
    id: record.id,
    tenant_id: record.tenant_id,
    twilio_message_sid: record.twilio_message_sid || null,
    direction: validateDirection(record.direction),
    from_number: record.from_number || "",
    to_number: record.to_number || "",
    body: record.body || "",
    status: record.status || "unknown",
    sent_at: normalizeTimestamp(record.sent_at),
    metadata: safeJsonParse(record.metadata, {}) as object,
    synced_at: new Date().toISOString(),
  };
}

// ============================================================================
// Validation Helpers
// ============================================================================

function validateChannel(channel: string): string {
  const valid = ["voice", "sms", "web", "api"];
  return valid.includes(channel) ? channel : "web";
}

function validateRole(role: string): string {
  const valid = ["user", "assistant", "system"];
  return valid.includes(role) ? role : "user";
}

function validateDirection(direction: string): string {
  const valid = ["inbound", "outbound"];
  return valid.includes(direction) ? direction : "inbound";
}

function normalizeTimestamp(value: string | null | undefined): string {
  if (!value) return new Date().toISOString();
  const date = parseTimestamp(value);
  return date ? date.toISOString() : new Date().toISOString();
}

// ============================================================================
// ETL Jobs
// ============================================================================

export async function etlConversationsToSilver(
  tenantId: string,
): Promise<ETLResult> {
  const dataType: DataType = "conversations";
  const errors: string[] = [];

  try {
    // Get last sync time
    const lastSync = await getLastSyncTime(tenantId, dataType);

    // Read from Bronze
    const bronze = await readBronzeConversations({ tenantId, since: lastSync });
    if (!bronze.success) {
      return {
        dataType,
        success: false,
        recordsProcessed: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        filesProcessed: [],
        errors: [bronze.error || "Failed to read Bronze"],
      };
    }

    // Deduplicate
    const unique = deduplicateById(bronze.records);

    // Transform
    const bronzeSource =
      bronze.files.length > 0 ? bronze.files[bronze.files.length - 1] : null;
    const silver = unique.map((r) => transformConversation(r, bronzeSource));

    // Upsert to Silver
    let inserted = 0;

    if (silver.length > 0) {
      const { error: upsertError, count } = await getServiceSupabase()
        .from("exo_silver_conversations")
        .upsert(silver, { onConflict: "id", count: "exact" });

      if (upsertError) {
        errors.push(`Upsert error: ${upsertError.message}`);
      } else {
        inserted = count || silver.length;
      }
    }

    // Update sync log
    await updateSyncLog(
      tenantId,
      dataType,
      bronze.files,
      silver.length,
      errors,
    );

    return {
      dataType,
      success: errors.length === 0,
      recordsProcessed: bronze.records.length,
      recordsInserted: inserted,
      recordsUpdated: 0,
      filesProcessed: bronze.files,
      errors,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return {
      dataType,
      success: false,
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      filesProcessed: [],
      errors: [msg],
    };
  }
}

export async function etlMessagesToSilver(
  tenantId: string,
): Promise<ETLResult> {
  const dataType: DataType = "messages";
  const errors: string[] = [];

  try {
    const lastSync = await getLastSyncTime(tenantId, dataType);
    const bronze = await readBronzeMessages({ tenantId, since: lastSync });

    if (!bronze.success) {
      return {
        dataType,
        success: false,
        recordsProcessed: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        filesProcessed: [],
        errors: [bronze.error || "Failed to read Bronze"],
      };
    }

    const unique = deduplicateById(bronze.records);
    const silver = unique.map(transformMessage);

    let inserted = 0;
    if (silver.length > 0) {
      const { error: upsertError, count } = await getServiceSupabase()
        .from("exo_silver_messages")
        .upsert(silver, { onConflict: "id", count: "exact" });

      if (upsertError) {
        errors.push(`Upsert error: ${upsertError.message}`);
      } else {
        inserted = count || silver.length;
      }
    }

    await updateSyncLog(
      tenantId,
      dataType,
      bronze.files,
      silver.length,
      errors,
    );

    return {
      dataType,
      success: errors.length === 0,
      recordsProcessed: bronze.records.length,
      recordsInserted: inserted,
      recordsUpdated: 0,
      filesProcessed: bronze.files,
      errors,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return {
      dataType,
      success: false,
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      filesProcessed: [],
      errors: [msg],
    };
  }
}

export async function etlVoiceCallsToSilver(
  tenantId: string,
): Promise<ETLResult> {
  const dataType: DataType = "voice_calls";
  const errors: string[] = [];

  try {
    const lastSync = await getLastSyncTime(tenantId, dataType);
    const bronze = await readBronzeVoiceCalls({ tenantId, since: lastSync });

    if (!bronze.success) {
      return {
        dataType,
        success: false,
        recordsProcessed: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        filesProcessed: [],
        errors: [bronze.error || "Failed to read Bronze"],
      };
    }

    const unique = deduplicateById(bronze.records);
    const silver = unique.map(transformVoiceCall);

    let inserted = 0;
    if (silver.length > 0) {
      const { error: upsertError, count } = await getServiceSupabase()
        .from("exo_silver_voice_calls")
        .upsert(silver, { onConflict: "id", count: "exact" });

      if (upsertError) {
        errors.push(`Upsert error: ${upsertError.message}`);
      } else {
        inserted = count || silver.length;
      }
    }

    await updateSyncLog(
      tenantId,
      dataType,
      bronze.files,
      silver.length,
      errors,
    );

    return {
      dataType,
      success: errors.length === 0,
      recordsProcessed: bronze.records.length,
      recordsInserted: inserted,
      recordsUpdated: 0,
      filesProcessed: bronze.files,
      errors,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return {
      dataType,
      success: false,
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      filesProcessed: [],
      errors: [msg],
    };
  }
}

export async function etlSmsLogsToSilver(tenantId: string): Promise<ETLResult> {
  const dataType: DataType = "sms_logs";
  const errors: string[] = [];

  try {
    const lastSync = await getLastSyncTime(tenantId, dataType);
    const bronze = await readBronzeSmsLogs({ tenantId, since: lastSync });

    if (!bronze.success) {
      return {
        dataType,
        success: false,
        recordsProcessed: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        filesProcessed: [],
        errors: [bronze.error || "Failed to read Bronze"],
      };
    }

    const unique = deduplicateById(bronze.records);
    const silver = unique.map(transformSmsLog);

    let inserted = 0;
    if (silver.length > 0) {
      const { error: upsertError, count } = await getServiceSupabase()
        .from("exo_silver_sms_logs")
        .upsert(silver, { onConflict: "id", count: "exact" });

      if (upsertError) {
        errors.push(`Upsert error: ${upsertError.message}`);
      } else {
        inserted = count || silver.length;
      }
    }

    await updateSyncLog(
      tenantId,
      dataType,
      bronze.files,
      silver.length,
      errors,
    );

    return {
      dataType,
      success: errors.length === 0,
      recordsProcessed: bronze.records.length,
      recordsInserted: inserted,
      recordsUpdated: 0,
      filesProcessed: bronze.files,
      errors,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return {
      dataType,
      success: false,
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      filesProcessed: [],
      errors: [msg],
    };
  }
}

// ============================================================================
// Main ETL Runner
// ============================================================================

export async function runSilverETL(): Promise<ETLSummary> {
  const startedAt = new Date();
  const results: ETLResult[] = [];
  const tenantIds: string[] = [];

  try {
    // Get all unique tenants from Bronze sync log (public schema)
    const { data: bronzeLogs } = await getServiceSupabase()
      .from("exo_bronze_sync_log")
      .select("tenant_id")
      .order("last_sync_at", { ascending: false });

    if (!bronzeLogs || bronzeLogs.length === 0) {
      // No Bronze data yet
      return {
        startedAt,
        completedAt: new Date(),
        tenants: [],
        results: [],
        totalRecords: 0,
        totalErrors: 0,
      };
    }

    // Get unique tenants
    const uniqueTenants = [...new Set(bronzeLogs.map((l) => l.tenant_id))];

    // Process each tenant
    for (const tenantId of uniqueTenants) {
      tenantIds.push(tenantId);

      // Run ETL for each data type
      const convResult = await etlConversationsToSilver(tenantId);
      results.push(convResult);

      const msgResult = await etlMessagesToSilver(tenantId);
      results.push(msgResult);

      const voiceResult = await etlVoiceCallsToSilver(tenantId);
      results.push(voiceResult);

      const smsResult = await etlSmsLogsToSilver(tenantId);
      results.push(smsResult);
    }

    return {
      startedAt,
      completedAt: new Date(),
      tenants: tenantIds,
      results,
      totalRecords: results.reduce((sum, r) => sum + r.recordsProcessed, 0),
      totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
    };
  } catch (error) {
    logger.error("[SilverETL] Fatal error:", error);
    return {
      startedAt,
      completedAt: new Date(),
      tenants: tenantIds,
      results,
      totalRecords: 0,
      totalErrors: 1,
    };
  }
}

// ============================================================================
// Direct Silver ETL (Bypass R2 — reads from raw Supabase tables)
// ============================================================================

/**
 * Direct ETL: raw Supabase tables → Silver tables (no R2 dependency).
 * Use when Bronze/R2 is unavailable or as the primary path.
 */
export async function runDirectSilverETL(): Promise<ETLSummary> {
  const startedAt = new Date();
  const results: ETLResult[] = [];
  const tenantIds: string[] = [];

  try {
    const sb = getServiceSupabase();
    const { data: tenants } = await sb.from("exo_tenants").select("id");

    if (!tenants || tenants.length === 0) {
      return {
        startedAt,
        completedAt: new Date(),
        tenants: [],
        results: [],
        totalRecords: 0,
        totalErrors: 0,
      };
    }

    for (const tenant of tenants) {
      tenantIds.push(tenant.id);

      const convResult = await directConversationsETL(tenant.id);
      results.push(convResult);

      const msgResult = await directMessagesETL(tenant.id);
      results.push(msgResult);

      const emailResult = await directEmailsETL(tenant.id);
      results.push(emailResult);
    }

    return {
      startedAt,
      completedAt: new Date(),
      tenants: tenantIds,
      results,
      totalRecords: results.reduce((sum, r) => sum + r.recordsProcessed, 0),
      totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
    };
  } catch (error) {
    logger.error("[DirectSilverETL] Fatal error:", error);
    return {
      startedAt,
      completedAt: new Date(),
      tenants: tenantIds,
      results,
      totalRecords: 0,
      totalErrors: 1,
    };
  }
}

async function directConversationsETL(tenantId: string): Promise<ETLResult> {
  const dataType: DataType = "conversations";
  const errors: string[] = [];

  try {
    const sb = getServiceSupabase();
    const lastSync = await getLastSyncTime(tenantId, dataType);

    const { data: raw, error: fetchError } = await sb
      .from("exo_conversations")
      .select(
        "id, tenant_id, channel, created_at, ended_at, duration_seconds, summary, context, insights",
      )
      .eq("tenant_id", tenantId)
      .gt("created_at", lastSync.toISOString())
      .order("created_at", { ascending: true })
      .limit(1000);

    if (fetchError) {
      return {
        dataType,
        success: false,
        recordsProcessed: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        filesProcessed: [],
        errors: [`Fetch error: ${fetchError.message}`],
      };
    }

    if (!raw || raw.length === 0) {
      return {
        dataType,
        success: true,
        recordsProcessed: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        filesProcessed: ["direct"],
        errors: [],
      };
    }

    const silver = raw.map((r) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      channel: validateChannel(r.channel || "web"),
      started_at: normalizeTimestamp(r.created_at),
      ended_at: r.ended_at ? normalizeTimestamp(r.ended_at) : null,
      duration_seconds: r.duration_seconds || 0,
      summary: r.summary || null,
      context:
        typeof r.context === "string"
          ? JSON.parse(r.context || "{}")
          : r.context || {},
      insights:
        typeof r.insights === "string"
          ? JSON.parse(r.insights || "[]")
          : r.insights || [],
      synced_at: new Date().toISOString(),
      bronze_source: "direct",
    }));

    let inserted = 0;
    if (silver.length > 0) {
      const { error: upsertError, count } = await sb
        .from("exo_silver_conversations")
        .upsert(silver, { onConflict: "id", count: "exact" });

      if (upsertError) {
        errors.push(`Upsert error: ${upsertError.message}`);
      } else {
        inserted = count || silver.length;
      }
    }

    await updateSyncLog(tenantId, dataType, ["direct"], silver.length, errors);

    return {
      dataType,
      success: errors.length === 0,
      recordsProcessed: raw.length,
      recordsInserted: inserted,
      recordsUpdated: 0,
      filesProcessed: ["direct"],
      errors,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return {
      dataType,
      success: false,
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      filesProcessed: [],
      errors: [msg],
    };
  }
}

async function directMessagesETL(tenantId: string): Promise<ETLResult> {
  const dataType: DataType = "messages";
  const errors: string[] = [];

  try {
    const sb = getServiceSupabase();
    const lastSync = await getLastSyncTime(tenantId, dataType);

    const { data: raw, error: fetchError } = await sb
      .from("exo_messages")
      .select(
        "id, conversation_id, tenant_id, role, content, created_at, duration_ms, audio_url, transcription_confidence, context",
      )
      .eq("tenant_id", tenantId)
      .gt("created_at", lastSync.toISOString())
      .order("created_at", { ascending: true })
      .limit(5000);

    if (fetchError) {
      return {
        dataType,
        success: false,
        recordsProcessed: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        filesProcessed: [],
        errors: [`Fetch error: ${fetchError.message}`],
      };
    }

    if (!raw || raw.length === 0) {
      return {
        dataType,
        success: true,
        recordsProcessed: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        filesProcessed: ["direct"],
        errors: [],
      };
    }

    const silver = raw.map((r) => ({
      id: r.id,
      conversation_id: r.conversation_id,
      tenant_id: r.tenant_id,
      role: validateRole(r.role || "user"),
      content: r.content || "",
      timestamp: normalizeTimestamp(r.created_at),
      duration_ms: r.duration_ms || 0,
      audio_url: r.audio_url || null,
      transcription_confidence: r.transcription_confidence ?? null,
      context:
        typeof r.context === "string"
          ? JSON.parse(r.context || "{}")
          : r.context || {},
      synced_at: new Date().toISOString(),
    }));

    let inserted = 0;
    if (silver.length > 0) {
      const { error: upsertError, count } = await sb
        .from("exo_silver_messages")
        .upsert(silver, { onConflict: "id", count: "exact" });

      if (upsertError) {
        errors.push(`Upsert error: ${upsertError.message}`);
      } else {
        inserted = count || silver.length;
      }
    }

    await updateSyncLog(tenantId, dataType, ["direct"], silver.length, errors);

    return {
      dataType,
      success: errors.length === 0,
      recordsProcessed: raw.length,
      recordsInserted: inserted,
      recordsUpdated: 0,
      filesProcessed: ["direct"],
      errors,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return {
      dataType,
      success: false,
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      filesProcessed: [],
      errors: [msg],
    };
  }
}

async function directEmailsETL(tenantId: string): Promise<ETLResult> {
  const dataType: DataType = "emails";
  const errors: string[] = [];

  try {
    const sb = getServiceSupabase();
    const lastSync = await getLastSyncTime(tenantId, dataType);

    const { data: raw, error: fetchError } = await sb
      .from("exo_analyzed_emails")
      .select(
        "id, tenant_id, account_id, provider_message_id, subject, from_email, from_name, to_emails, cc_emails, date_received, category, subcategory, priority_score, sentiment, analysis_status, action_items, key_facts, follow_up_needed, follow_up_by, is_read, has_attachments, created_at, updated_at",
      )
      .eq("tenant_id", tenantId)
      .gt("updated_at", lastSync.toISOString())
      .order("date_received", { ascending: true })
      .limit(2000);

    if (fetchError) {
      return {
        dataType,
        success: false,
        recordsProcessed: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        filesProcessed: [],
        errors: [`Fetch error: ${fetchError.message}`],
      };
    }

    if (!raw || raw.length === 0) {
      return {
        dataType,
        success: true,
        recordsProcessed: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        filesProcessed: ["direct"],
        errors: [],
      };
    }

    const silver = raw.map((r) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      account_id: r.account_id || null,
      provider_message_id: r.provider_message_id || null,
      subject: r.subject || null,
      from_email: r.from_email || "",
      from_name: r.from_name || null,
      to_emails: r.to_emails || [],
      cc_emails: r.cc_emails || [],
      date_received: normalizeTimestamp(r.date_received),
      category: r.category || "uncategorized",
      subcategory: r.subcategory || null,
      priority_score: r.priority_score || 0,
      sentiment: r.sentiment || "neutral",
      analysis_status: r.analysis_status || "pending",
      action_items: r.action_items || [],
      key_facts: r.key_facts || [],
      follow_up_needed: r.follow_up_needed || false,
      follow_up_by: r.follow_up_by || null,
      is_read: r.is_read || false,
      has_attachments: r.has_attachments || false,
      synced_at: new Date().toISOString(),
      bronze_source: "direct",
    }));

    let inserted = 0;
    if (silver.length > 0) {
      const { error: upsertError, count } = await sb
        .from("exo_silver_emails")
        .upsert(silver, { onConflict: "id", count: "exact" });

      if (upsertError) {
        errors.push(`Upsert error: ${upsertError.message}`);
      } else {
        inserted = count || silver.length;
      }
    }

    await updateSyncLog(tenantId, dataType, ["direct"], silver.length, errors);

    return {
      dataType,
      success: errors.length === 0,
      recordsProcessed: raw.length,
      recordsInserted: inserted,
      recordsUpdated: 0,
      filesProcessed: ["direct"],
      errors,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return {
      dataType,
      success: false,
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      filesProcessed: [],
      errors: [msg],
    };
  }
}

// ============================================================================
// Stats
// ============================================================================

export async function getSilverStats(): Promise<{
  conversations: number;
  messages: number;
  voiceCalls: number;
  smsLogs: number;
  emails: number;
  lastSync: string | null;
}> {
  const sb = getServiceSupabase();
  const [convCount, msgCount, voiceCount, smsCount, emailCount, lastSync] =
    await Promise.all([
      sb
        .from("exo_silver_conversations")
        .select("*", { count: "exact", head: true }),
      sb
        .from("exo_silver_messages")
        .select("*", { count: "exact", head: true }),
      sb
        .from("exo_silver_voice_calls")
        .select("*", { count: "exact", head: true }),
      sb
        .from("exo_silver_sms_logs")
        .select("*", { count: "exact", head: true }),
      sb.from("exo_silver_emails").select("*", { count: "exact", head: true }),
      sb
        .from("exo_silver_sync_log")
        .select("last_sync_at")
        .order("last_sync_at", { ascending: false })
        .limit(1)
        .single(),
    ]);

  return {
    conversations: convCount.count || 0,
    messages: msgCount.count || 0,
    voiceCalls: voiceCount.count || 0,
    smsLogs: smsCount.count || 0,
    emails: emailCount.count || 0,
    lastSync: lastSync.data?.last_sync_at || null,
  };
}
