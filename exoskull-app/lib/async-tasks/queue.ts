/**
 * Async Task Queue — CRUD operations
 *
 * All database operations for the exo_async_tasks table.
 * Uses service_role client (bypasses RLS) for CRON worker access.
 */

import type { GatewayChannel } from "../gateway/types";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logAdminError } from "@/lib/admin/logger";

import { logger } from "@/lib/logger";
// ============================================================================
// TYPES
// ============================================================================

export interface AsyncTask {
  id: string;
  tenant_id: string;
  channel: GatewayChannel;
  channel_metadata: Record<string, unknown>;
  reply_to: string;
  prompt: string;
  session_id: string | null;
  status: "queued" | "processing" | "completed" | "failed";
  result: string | null;
  tools_used: string[];
  progress: number;
  error: string | null;
  retry_count: number;
  max_retries: number;
  locked_until: string | null;
  locked_by: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface CreateTaskParams {
  tenantId: string;
  channel: GatewayChannel;
  channelMetadata: Record<string, unknown>;
  replyTo: string;
  prompt: string;
  sessionId?: string;
}

// ============================================================================
// CREATE
// ============================================================================

/**
 * Enqueue a new async task. Returns the task ID.
 */
export async function createTask(params: CreateTaskParams): Promise<string> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("exo_async_tasks")
    .insert({
      tenant_id: params.tenantId,
      channel: params.channel,
      channel_metadata: params.channelMetadata,
      reply_to: params.replyTo,
      prompt: params.prompt,
      session_id: params.sessionId || null,
      status: "queued",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[AsyncQueue] Failed to create task:", {
      error: error?.message,
      tenantId: params.tenantId,
      channel: params.channel,
    });
    throw new Error(`Failed to create async task: ${error?.message}`);
  }

  logger.info("[AsyncQueue] Task created:", {
    taskId: data.id,
    tenantId: params.tenantId,
    channel: params.channel,
    promptLength: params.prompt.length,
  });

  return data.id;
}

// ============================================================================
// CLAIM (Atomic dequeue)
// ============================================================================

/**
 * Claim the next pending task using Postgres FOR UPDATE SKIP LOCKED.
 * Returns null if no tasks are available.
 */
export async function claimNextTask(
  workerId: string,
): Promise<AsyncTask | null> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase.rpc("claim_async_task", {
    p_worker_id: workerId,
    p_lock_seconds: 55, // Just under Vercel's 60s timeout
  });

  if (error) {
    console.error("[AsyncQueue] Failed to claim task:", {
      error: error.message,
      workerId,
    });
    return null;
  }

  // RPC returns array (RETURNS SETOF), take first element
  const task = Array.isArray(data) ? data[0] : data;
  if (!task) return null;

  logger.info("[AsyncQueue] Task claimed:", {
    taskId: task.id,
    tenantId: task.tenant_id,
    channel: task.channel,
    workerId,
  });

  return task as AsyncTask;
}

// ============================================================================
// COMPLETE
// ============================================================================

/**
 * Mark task as completed with result.
 */
export async function completeTask(
  taskId: string,
  result: string,
  toolsUsed: string[],
): Promise<void> {
  const supabase = getServiceSupabase();

  const { error } = await supabase
    .from("exo_async_tasks")
    .update({
      status: "completed",
      result,
      tools_used: toolsUsed,
      progress: 100,
      completed_at: new Date().toISOString(),
      locked_until: null,
      locked_by: null,
    })
    .eq("id", taskId);

  if (error) {
    console.error("[AsyncQueue] Failed to complete task:", {
      taskId,
      error: error.message,
    });
  }
}

// ============================================================================
// FAIL
// ============================================================================

/**
 * Mark task as failed. Re-queues if retries remaining, otherwise permanent fail.
 */
export async function failTask(
  taskId: string,
  errorMessage: string,
): Promise<{ exhausted: boolean }> {
  const supabase = getServiceSupabase();

  // Get current retry state
  const { data: task } = await supabase
    .from("exo_async_tasks")
    .select("retry_count, max_retries")
    .eq("id", taskId)
    .single();

  const newRetryCount = (task?.retry_count || 0) + 1;
  const maxRetries = task?.max_retries || 2;
  const exhausted = newRetryCount >= maxRetries;

  const { error } = await supabase
    .from("exo_async_tasks")
    .update({
      status: exhausted ? "failed" : "queued",
      error: errorMessage,
      retry_count: newRetryCount,
      locked_until: null,
      locked_by: null,
      ...(exhausted ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", taskId);

  if (error) {
    console.error("[AsyncQueue] Failed to update failed task:", {
      taskId,
      error: error.message,
    });
  }

  logger.info("[AsyncQueue] Task failed:", {
    taskId,
    retryCount: newRetryCount,
    maxRetries,
    exhausted,
    errorMessage,
  });

  // Dead letter queue: capture permanently failed tasks for review
  if (exhausted) {
    try {
      const { data: fullTask } = await supabase
        .from("exo_async_tasks")
        .select("tenant_id, channel, prompt")
        .eq("id", taskId)
        .single();

      if (fullTask) {
        await supabase.from("exo_async_dead_letters").insert({
          original_task_id: taskId,
          tenant_id: fullTask.tenant_id,
          channel: fullTask.channel,
          prompt: fullTask.prompt,
          final_error: errorMessage,
          retry_count: newRetryCount,
        });

        await logAdminError(
          "async-tasks:dead-letter",
          "error",
          `Task ${taskId} exhausted all retries: ${errorMessage}`,
          { taskId, tenantId: fullTask.tenant_id, channel: fullTask.channel },
        );
      }
    } catch (dlError) {
      console.error("[AsyncQueue] Failed to create dead letter:", {
        taskId,
        error: dlError instanceof Error ? dlError.message : dlError,
      });
    }
  }

  return { exhausted };
}

// ============================================================================
// LOCK MANAGEMENT
// ============================================================================

/**
 * Release expired locks from crashed workers.
 * Called at the start of each CRON run as a safety net.
 */
export async function releaseExpiredLocks(): Promise<number> {
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("exo_async_tasks")
    .update({
      status: "queued",
      locked_until: null,
      locked_by: null,
    })
    .eq("status", "processing")
    .lte("locked_until", now)
    .select("id");

  if (error) {
    console.error("[AsyncQueue] Failed to release expired locks:", {
      error: error.message,
    });
    return 0;
  }

  const count = data?.length || 0;
  if (count > 0) {
    logger.info("[AsyncQueue] Released expired locks:", count);
  }
  return count;
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get the latest pending task for a tenant (for status check queries).
 */
export async function getLatestPendingTask(
  tenantId: string,
): Promise<AsyncTask | null> {
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("exo_async_tasks")
    .select("*")
    .eq("tenant_id", tenantId)
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as AsyncTask) || null;
}

/**
 * Get count of pending tasks (for monitoring/CRON logging).
 */
export async function getPendingCount(): Promise<number> {
  const supabase = getServiceSupabase();

  const { count, error } = await supabase
    .from("exo_async_tasks")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "processing"]);

  if (error) return 0;
  return count || 0;
}
