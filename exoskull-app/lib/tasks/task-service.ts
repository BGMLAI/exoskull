/**
 * Task Service — Centralized data access layer for tasks
 *
 * All task read/write operations go through here.
 * Internally uses dual-write/dual-read for Tyrolka migration transparency.
 * Defaults to service-role client (works in IORS tools, CRONs, API routes).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/service";
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
  return dualWriteTask(tenantId, input, supabase);
}

export async function updateTask(
  taskId: string,
  tenantId: string,
  updates: Partial<TaskInput>,
  supabase?: SupabaseClient,
): Promise<{ success: boolean; error?: string }> {
  return dualUpdateTask(taskId, tenantId, updates, supabase);
}

export async function completeTask(
  taskId: string,
  tenantId: string,
  supabase?: SupabaseClient,
): Promise<{ success: boolean; error?: string }> {
  return dualUpdateTask(taskId, tenantId, { status: "done" }, supabase);
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

export async function getTaskStats(
  tenantId: string,
  supabase?: SupabaseClient,
): Promise<{
  pending: number;
  in_progress: number;
  done: number;
  total: number;
}> {
  const tasks = await dualReadTasks(tenantId, undefined, supabase);

  const stats = { pending: 0, in_progress: 0, done: 0, total: tasks.length };
  for (const t of tasks) {
    if (t.status === "pending") stats.pending++;
    else if (t.status === "in_progress") stats.in_progress++;
    else if (t.status === "done") stats.done++;
  }

  return stats;
}
