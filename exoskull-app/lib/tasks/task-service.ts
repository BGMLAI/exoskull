/**
 * Task Service — Centralized data access layer for tasks
 *
 * All task read/write operations go through here.
 * Internally uses dual-write/dual-read for Tyrolka migration transparency.
 * Defaults to service-role client (works in IORS tools, CRONs, API routes).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/service";
import { invalidateContextCache } from "@/lib/voice/dynamic-context";
import { logger } from "@/lib/logger";
import { dualWriteTask, dualUpdateTask } from "./dual-write";
import type { TaskInput, TaskOutput } from "./dual-write";
import { dualReadTask, dualReadTasks } from "./dual-read";
import type { Task, TaskFilters } from "./dual-read";

export type { Task, TaskInput, TaskOutput, TaskFilters };

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

export async function createTask(
  tenantId: string,
  input: TaskInput,
  supabase?: SupabaseClient,
): Promise<TaskOutput> {
  const result = await dualWriteTask(tenantId, input, supabase);
  if (result.id && !result.dual_write_success) {
    logger.warn("[TaskService] Dual-write partial failure:", {
      tenantId,
      taskId: result.id,
      error: result.error,
    });
  }
  invalidateContextCache(tenantId);
  return result;
}

export async function updateTask(
  taskId: string,
  tenantId: string,
  updates: Partial<TaskInput>,
  supabase?: SupabaseClient,
): Promise<{ success: boolean; error?: string }> {
  // Check if this is a completion event with a goal_id
  const isCompletion =
    updates.status === "done" || (updates.status as string) === "completed";

  const result = await dualUpdateTask(taskId, tenantId, updates, supabase);
  invalidateContextCache(tenantId);

  // Fire goal feedback loop (non-blocking)
  if (isCompletion && result.success) {
    fireGoalFeedback(tenantId, taskId, supabase).catch(() => {});
  }

  return result;
}

export async function completeTask(
  taskId: string,
  tenantId: string,
  supabase?: SupabaseClient,
): Promise<{ success: boolean; error?: string }> {
  const result = await dualUpdateTask(
    taskId,
    tenantId,
    { status: "done" },
    supabase,
  );

  // Fire goal feedback loop (non-blocking)
  if (result.success) {
    fireGoalFeedback(tenantId, taskId, supabase).catch(() => {});
  }

  return result;
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

export async function getTask(
  taskId: string,
  tenantId: string,
  supabase?: SupabaseClient,
): Promise<Task | null> {
  return dualReadTask(taskId, tenantId, supabase);
}

export async function getTasks(
  tenantId: string,
  filters?: TaskFilters,
  supabase?: SupabaseClient,
): Promise<Task[]> {
  return dualReadTasks(tenantId, filters, supabase);
}

export async function getOverdueTasks(
  tenantId: string,
  limit?: number,
  supabase?: SupabaseClient,
): Promise<Task[]> {
  return dualReadTasks(
    tenantId,
    { overdue: true, status: "pending", limit },
    supabase,
  );
}

export async function findTaskByTitle(
  tenantId: string,
  titleFragment: string,
  supabase?: SupabaseClient,
): Promise<Task | null> {
  const sb = supabase || getServiceSupabase();

  // Search legacy first (always available)
  const { data: tasks } = await sb
    .from("exo_tasks")
    .select("id, title")
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "in_progress"])
    .ilike("title", `%${titleFragment}%`)
    .limit(1);

  if (tasks && tasks.length > 0) {
    return dualReadTask(tasks[0].id, tenantId, sb);
  }

  // Try Tyrolka directly
  const { data: ops } = await sb
    .from("user_ops")
    .select("id, title")
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "active"])
    .ilike("title", `%${titleFragment}%`)
    .limit(1);

  if (ops && ops.length > 0) {
    return dualReadTask(ops[0].id, tenantId, sb);
  }

  return null;
}

// ============================================================================
// GOAL FEEDBACK HELPER
// ============================================================================

async function fireGoalFeedback(
  tenantId: string,
  taskId: string,
  supabase?: SupabaseClient,
): Promise<void> {
  try {
    const sb = supabase || getServiceSupabase();
    // Check if task has a goal_id in context
    const { data: task } = await sb
      .from("exo_tasks")
      .select("context")
      .eq("id", taskId)
      .single();

    const goalId = task?.context?.goal_id;
    if (!goalId) return;

    const { onTaskCompleted } = await import("@/lib/goals/goal-feedback");
    await onTaskCompleted(tenantId, goalId, taskId);
  } catch {
    // Non-blocking — goal feedback is best-effort
  }
}

export async function getTaskStats(
  tenantId: string,
  supabase?: SupabaseClient,
): Promise<{
  pending: number;
  in_progress: number;
  done: number;
  total: number;
}> {
  const sb = supabase || getServiceSupabase();

  // All 6 counts in ONE parallel batch — was fetching ALL task objects to count in JS (~100-150ms → ~15ms)
  const [tPending, tActive, tCompleted, lPending, lInProgress, lDone] =
    await Promise.all([
      sb
        .from("user_ops")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending"),
      sb
        .from("user_ops")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "active"),
      sb
        .from("user_ops")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "completed"),
      sb
        .from("exo_tasks")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending"),
      sb
        .from("exo_tasks")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "in_progress"),
      sb
        .from("exo_tasks")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "done"),
    ]);

  // Tyrolka first, legacy fallback
  const tyrolkaTotal =
    (tPending.count ?? 0) + (tActive.count ?? 0) + (tCompleted.count ?? 0);
  if (tyrolkaTotal > 0) {
    return {
      pending: tPending.count ?? 0,
      in_progress: tActive.count ?? 0,
      done: tCompleted.count ?? 0,
      total: tyrolkaTotal,
    };
  }

  return {
    pending: lPending.count ?? 0,
    in_progress: lInProgress.count ?? 0,
    done: lDone.count ?? 0,
    total:
      (lPending.count ?? 0) + (lInProgress.count ?? 0) + (lDone.count ?? 0),
  };
}
