/**
 * Activity Log — IORS Observability
 *
 * Records every action IORS takes so the user can see what's happening.
 * All calls are fire-and-forget — never blocks the main flow.
 */

import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
export type ActivityType =
  | "chat_message"
  | "tool_call"
  | "loop_eval"
  | "cron_action"
  | "intervention"
  | "error";

export interface LogActivityParams {
  tenantId: string;
  actionType: ActivityType;
  actionName: string;
  description: string;
  status?: "success" | "failed" | "pending" | "skipped";
  source?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an IORS activity. Fire-and-forget — errors are caught and logged,
 * never propagated to the caller.
 */
export function logActivity(params: LogActivityParams): void {
  _logActivityAsync(params).catch((err) => {
    logger.error("[ActivityLog] Failed to log activity:", {
      error: err instanceof Error ? err.message : err,
      actionName: params.actionName,
      tenantId: params.tenantId,
    });
  });
}

async function _logActivityAsync(params: LogActivityParams): Promise<void> {
  const supabase = getServiceSupabase();

  const { error } = await supabase.from("exo_activity_log").insert({
    tenant_id: params.tenantId,
    action_type: params.actionType,
    action_name: params.actionName,
    description: params.description,
    status: params.status || "success",
    source: params.source || "system",
    metadata: params.metadata || {},
  });

  if (error) {
    logger.error("[ActivityLog] Insert failed:", {
      error: error.message,
      tenantId: params.tenantId,
      actionName: params.actionName,
    });
  }
}

/**
 * Batch-log multiple activities at once (e.g., after tool loop).
 */
export function logActivities(entries: LogActivityParams[]): void {
  if (entries.length === 0) return;

  _logActivitiesBatch(entries).catch((err) => {
    logger.error("[ActivityLog] Batch log failed:", {
      error: err instanceof Error ? err.message : err,
      count: entries.length,
    });
  });
}

async function _logActivitiesBatch(
  entries: LogActivityParams[],
): Promise<void> {
  const supabase = getServiceSupabase();

  const rows = entries.map((e) => ({
    tenant_id: e.tenantId,
    action_type: e.actionType,
    action_name: e.actionName,
    description: e.description,
    status: e.status || "success",
    source: e.source || "system",
    metadata: e.metadata || {},
  }));

  const { error } = await supabase.from("exo_activity_log").insert(rows);

  if (error) {
    logger.error("[ActivityLog] Batch insert failed:", {
      error: error.message,
      count: rows.length,
    });
  }
}
