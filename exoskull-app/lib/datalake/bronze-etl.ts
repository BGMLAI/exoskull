/**
 * Bronze Layer ETL
 * Extracts data from Supabase and writes to R2 as Parquet
 *
 * Runs hourly via Vercel Cron to sync new data to Bronze layer.
 * Uses incremental sync based on last sync timestamp per tenant/data_type.
 */

import { writeToBronze, type DataType } from "../storage/r2-client";
import {
  conversationsToParquet,
  messagesToParquet,
  jobLogsToParquet,
  emailsToParquet,
  type ConversationRecord,
  type MessageRecord,
  type JobLogRecord,
  type EmailRecord,
} from "../storage/parquet-writer";
import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
// Service role client for ETL (bypasses RLS)
// ============================================================================
// Types
// ============================================================================

export interface ETLResult {
  tenant_id: string;
  data_type: DataType;
  records_processed: number;
  bytes_written: number;
  success: boolean;
  duration_ms: number;
  error?: string;
}

export interface ETLSummary {
  started_at: string;
  completed_at: string;
  duration_ms: number;
  tenants_processed: number;
  total_records: number;
  total_bytes: number;
  results: ETLResult[];
  errors: Array<{ tenant_id: string; data_type: string; error: string }>;
}

// ============================================================================
// Sync Log Management
// ============================================================================

/**
 * Get last sync timestamp for a tenant/data_type
 */
async function getLastSyncTime(
  tenantId: string,
  dataType: DataType,
): Promise<Date> {
  const { data, error } = await getServiceSupabase()
    .from("exo_bronze_sync_log")
    .select("last_sync_at")
    .eq("tenant_id", tenantId)
    .eq("data_type", dataType)
    .single();

  if (error || !data) {
    // No previous sync - return epoch (sync all data)
    return new Date(0);
  }

  return new Date(data.last_sync_at);
}

/**
 * Update sync timestamp after successful ETL
 */
async function updateSyncTime(
  tenantId: string,
  dataType: DataType,
  syncTime: Date,
  recordsSynced: number,
  bytesWritten: number,
): Promise<void> {
  const { error } = await getServiceSupabase()
    .from("exo_bronze_sync_log")
    .upsert(
      {
        tenant_id: tenantId,
        data_type: dataType,
        last_sync_at: syncTime.toISOString(),
        records_synced: recordsSynced,
        bytes_written: bytesWritten,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "tenant_id,data_type",
      },
    );

  if (error) {
    logger.error(`[Bronze ETL] Failed to update sync log:`, error);
  }
}

// ============================================================================
// ETL Functions
// ============================================================================

/**
 * ETL conversations for a single tenant
 */
export async function etlConversations(tenantId: string): Promise<ETLResult> {
  const dataType: DataType = "conversations";
  const startTime = Date.now();
  const lastSync = await getLastSyncTime(tenantId, dataType);
  const now = new Date();

  try {
    // Fetch new/updated conversations since last sync
    const { data: conversations, error } = await getServiceSupabase()
      .from("exo_conversations")
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("updated_at", lastSync.toISOString())
      .lt("updated_at", now.toISOString())
      .order("started_at", { ascending: true });

    if (error) throw error;

    if (!conversations || conversations.length === 0) {
      return {
        tenant_id: tenantId,
        data_type: dataType,
        records_processed: 0,
        bytes_written: 0,
        success: true,
        duration_ms: Date.now() - startTime,
      };
    }

    // Transform to Parquet record format
    const records: ConversationRecord[] = conversations.map((c) => ({
      id: c.id,
      tenant_id: c.tenant_id,
      channel: c.channel || "voice",
      started_at: c.started_at,
      ended_at: c.ended_at,
      duration_seconds: c.duration_seconds,
      summary: c.summary,
      context: JSON.stringify(c.context || {}),
      insights: JSON.stringify(c.insights || []),
      created_at: c.created_at,
      updated_at: c.updated_at || c.created_at,
    }));

    // Convert to Parquet
    const parquetBuffer = conversationsToParquet(records);

    // Write to R2
    const result = await writeToBronze({
      tenantId,
      dataType,
      data: parquetBuffer,
      date: now,
      metadata: { recordsCount: String(records.length) },
    });

    if (!result.success) {
      throw new Error(result.error || "Failed to write to R2");
    }

    // Update sync log
    await updateSyncTime(
      tenantId,
      dataType,
      now,
      records.length,
      result.bytesWritten,
    );

    return {
      tenant_id: tenantId,
      data_type: dataType,
      records_processed: records.length,
      bytes_written: result.bytesWritten,
      success: true,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    logger.error(`[Bronze ETL] Conversations failed for ${tenantId}:`, error);
    return {
      tenant_id: tenantId,
      data_type: dataType,
      records_processed: 0,
      bytes_written: 0,
      success: false,
      duration_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * ETL messages for a single tenant
 */
export async function etlMessages(tenantId: string): Promise<ETLResult> {
  const dataType: DataType = "messages";
  const startTime = Date.now();
  const lastSync = await getLastSyncTime(tenantId, dataType);
  const now = new Date();

  try {
    // Fetch new messages since last sync
    const { data: messages, error } = await getServiceSupabase()
      .from("exo_messages")
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("created_at", lastSync.toISOString())
      .lt("created_at", now.toISOString())
      .order("timestamp", { ascending: true });

    if (error) throw error;

    if (!messages || messages.length === 0) {
      return {
        tenant_id: tenantId,
        data_type: dataType,
        records_processed: 0,
        bytes_written: 0,
        success: true,
        duration_ms: Date.now() - startTime,
      };
    }

    // Transform to Parquet record format
    const records: MessageRecord[] = messages.map((m) => ({
      id: m.id,
      conversation_id: m.conversation_id,
      tenant_id: m.tenant_id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      duration_ms: m.duration_ms,
      audio_url: m.audio_url,
      transcription_confidence: m.transcription_confidence,
      context: JSON.stringify(m.context || {}),
    }));

    // Convert to Parquet
    const parquetBuffer = messagesToParquet(records);

    // Write to R2
    const result = await writeToBronze({
      tenantId,
      dataType,
      data: parquetBuffer,
      date: now,
      metadata: { recordsCount: String(records.length) },
    });

    if (!result.success) {
      throw new Error(result.error || "Failed to write to R2");
    }

    // Update sync log
    await updateSyncTime(
      tenantId,
      dataType,
      now,
      records.length,
      result.bytesWritten,
    );

    return {
      tenant_id: tenantId,
      data_type: dataType,
      records_processed: records.length,
      bytes_written: result.bytesWritten,
      success: true,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    logger.error(`[Bronze ETL] Messages failed for ${tenantId}:`, error);
    return {
      tenant_id: tenantId,
      data_type: dataType,
      records_processed: 0,
      bytes_written: 0,
      success: false,
      duration_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * ETL scheduled job logs for a single tenant
 */
export async function etlJobLogs(tenantId: string): Promise<ETLResult> {
  const dataType: DataType = "voice_calls"; // Using voice_calls for job logs
  const startTime = Date.now();
  const lastSync = await getLastSyncTime(tenantId, dataType);
  const now = new Date();

  try {
    // Fetch new job logs since last sync
    const { data: logs, error } = await getServiceSupabase()
      .from("exo_scheduled_job_logs")
      .select(
        `
        id,
        job_id,
        tenant_id,
        scheduled_at,
        executed_at,
        status,
        channel_used,
        result_payload,
        error_message,
        exo_scheduled_jobs!inner(job_name)
      `,
      )
      .eq("tenant_id", tenantId)
      .gte("created_at", lastSync.toISOString())
      .lt("created_at", now.toISOString())
      .order("scheduled_at", { ascending: true });

    if (error) throw error;

    if (!logs || logs.length === 0) {
      return {
        tenant_id: tenantId,
        data_type: dataType,
        records_processed: 0,
        bytes_written: 0,
        success: true,
        duration_ms: Date.now() - startTime,
      };
    }

    // Transform to Parquet record format
    const records: JobLogRecord[] = logs.map((l) => {
      // Handle the joined table - could be an object or array depending on Supabase version
      const jobInfo = l.exo_scheduled_jobs as
        | { job_name: string }
        | { job_name: string }[]
        | null;
      const jobName = Array.isArray(jobInfo)
        ? jobInfo[0]?.job_name
        : jobInfo?.job_name;
      return {
        id: l.id,
        job_id: l.job_id,
        job_name: jobName || "unknown",
        tenant_id: l.tenant_id,
        scheduled_at: l.scheduled_at,
        executed_at: l.executed_at,
        status: l.status,
        channel_used: l.channel_used,
        result_payload: JSON.stringify(l.result_payload || {}),
        error_message: l.error_message,
      };
    });

    // Convert to Parquet
    const parquetBuffer = jobLogsToParquet(records);

    // Write to R2
    const result = await writeToBronze({
      tenantId,
      dataType,
      data: parquetBuffer,
      date: now,
      metadata: { recordsCount: String(records.length) },
    });

    if (!result.success) {
      throw new Error(result.error || "Failed to write to R2");
    }

    // Update sync log
    await updateSyncTime(
      tenantId,
      dataType,
      now,
      records.length,
      result.bytesWritten,
    );

    return {
      tenant_id: tenantId,
      data_type: dataType,
      records_processed: records.length,
      bytes_written: result.bytesWritten,
      success: true,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    logger.error(`[Bronze ETL] Job logs failed for ${tenantId}:`, error);
    return {
      tenant_id: tenantId,
      data_type: dataType,
      records_processed: 0,
      bytes_written: 0,
      success: false,
      duration_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * ETL analyzed emails for a single tenant
 */
export async function etlEmails(tenantId: string): Promise<ETLResult> {
  const dataType: DataType = "emails";
  const startTime = Date.now();
  const lastSync = await getLastSyncTime(tenantId, dataType);
  const now = new Date();

  try {
    const { data: emails, error } = await getServiceSupabase()
      .from("exo_analyzed_emails")
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("updated_at", lastSync.toISOString())
      .lt("updated_at", now.toISOString())
      .order("date_received", { ascending: true });

    if (error) throw error;

    if (!emails || emails.length === 0) {
      return {
        tenant_id: tenantId,
        data_type: dataType,
        records_processed: 0,
        bytes_written: 0,
        success: true,
        duration_ms: Date.now() - startTime,
      };
    }

    const records: EmailRecord[] = emails.map((e) => ({
      id: e.id,
      tenant_id: e.tenant_id,
      account_id: e.account_id || "",
      provider_message_id: e.provider_message_id || "",
      subject: e.subject || "",
      from_email: e.from_email || "",
      from_name: e.from_name || "",
      to_emails: JSON.stringify(e.to_emails || []),
      date_received: e.date_received || e.created_at,
      category: e.category || "uncategorized",
      priority_score: e.priority_score || 0,
      sentiment: e.sentiment || "neutral",
      analysis_status: e.analysis_status || "pending",
      action_items: JSON.stringify(e.action_items || []),
      key_facts: JSON.stringify(e.key_facts || []),
      follow_up_needed: e.follow_up_needed || false,
      follow_up_by: e.follow_up_by || "",
      is_read: e.is_read || false,
      created_at: e.created_at,
      updated_at: e.updated_at || e.created_at,
    }));

    const parquetBuffer = emailsToParquet(records);

    const result = await writeToBronze({
      tenantId,
      dataType,
      data: parquetBuffer,
      date: now,
      metadata: { recordsCount: String(records.length) },
    });

    if (!result.success) {
      throw new Error(result.error || "Failed to write to R2");
    }

    await updateSyncTime(
      tenantId,
      dataType,
      now,
      records.length,
      result.bytesWritten,
    );

    return {
      tenant_id: tenantId,
      data_type: dataType,
      records_processed: records.length,
      bytes_written: result.bytesWritten,
      success: true,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    logger.error(`[Bronze ETL] Emails failed for ${tenantId}:`, error);
    return {
      tenant_id: tenantId,
      data_type: dataType,
      records_processed: 0,
      bytes_written: 0,
      success: false,
      duration_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Main ETL Runner
// ============================================================================

/**
 * Run full Bronze ETL for all tenants
 */
export async function runBronzeETL(): Promise<ETLSummary> {
  const startedAt = new Date();
  const results: ETLResult[] = [];

  logger.info(`[Bronze ETL] Starting at ${startedAt.toISOString()}`);

  // Get all active tenants
  const { data: tenants, error } = await getServiceSupabase()
    .from("exo_tenants")
    .select("id");

  if (error) {
    logger.error("[Bronze ETL] Failed to fetch tenants:", error);
    return {
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      tenants_processed: 0,
      total_records: 0,
      total_bytes: 0,
      results: [],
      errors: [
        { tenant_id: "system", data_type: "tenants", error: error.message },
      ],
    };
  }

  if (!tenants || tenants.length === 0) {
    logger.info("[Bronze ETL] No tenants found");
    return {
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      tenants_processed: 0,
      total_records: 0,
      total_bytes: 0,
      results: [],
      errors: [],
    };
  }

  logger.info(`[Bronze ETL] Processing ${tenants.length} tenants`);

  // Process each tenant
  for (const tenant of tenants) {
    logger.info(`[Bronze ETL] Processing tenant: ${tenant.id}`);

    // Run ETL for each data type
    const conversationsResult = await etlConversations(tenant.id);
    results.push(conversationsResult);

    const messagesResult = await etlMessages(tenant.id);
    results.push(messagesResult);

    const emailsResult = await etlEmails(tenant.id);
    results.push(emailsResult);

    // Note: Job logs ETL commented out until table structure is verified
    // const jobLogsResult = await etlJobLogs(tenant.id)
    // results.push(jobLogsResult)
  }

  const completedAt = new Date();

  // Build summary
  const summary: ETLSummary = {
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_ms: completedAt.getTime() - startedAt.getTime(),
    tenants_processed: tenants.length,
    total_records: results.reduce((sum, r) => sum + r.records_processed, 0),
    total_bytes: results.reduce((sum, r) => sum + r.bytes_written, 0),
    results,
    errors: results
      .filter((r) => !r.success)
      .map((r) => ({
        tenant_id: r.tenant_id,
        data_type: r.data_type,
        error: r.error || "Unknown error",
      })),
  };

  logger.info(`[Bronze ETL] Complete:`, {
    duration_ms: summary.duration_ms,
    tenants: summary.tenants_processed,
    records: summary.total_records,
    bytes: summary.total_bytes,
    errors: summary.errors.length,
  });

  return summary;
}

/**
 * Run ETL for a specific tenant (for manual testing)
 */
export async function runBronzeETLForTenant(
  tenantId: string,
): Promise<ETLResult[]> {
  const results: ETLResult[] = [];

  const conversationsResult = await etlConversations(tenantId);
  results.push(conversationsResult);

  const messagesResult = await etlMessages(tenantId);
  results.push(messagesResult);

  return results;
}
