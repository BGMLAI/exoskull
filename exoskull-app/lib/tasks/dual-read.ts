/**
 * Dual-Read Wrappers for Quest System Migration
 *
 * Reads from Tyrolka Framework FIRST, falls back to legacy tables if not found.
 * Enabled via feature flags in exo_tenants.iors_behavior_presets.
 *
 * Critical Features:
 * - Accepts any SupabaseClient (works in IORS tools, CRONs, and API routes)
 * - Tyrolka-first strategy (future-proof)
 * - Automatic fallback to legacy on miss
 * - Transparent mapping via exo_migration_map
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/service";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Task {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  _source: "tyrolka" | "legacy";
  _migrated: boolean;
}

export interface Goal {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  category: string;
  is_active: boolean;
  start_date: string;
  target_date: string | null;
  target_unit?: string | null;
  created_at: string;
  updated_at: string;
  _source: "tyrolka" | "legacy";
  _migrated: boolean;
}

export interface TaskFilters {
  status?: string;
  limit?: number;
  overdue?: boolean;
}

export interface GoalFilters {
  is_active?: boolean;
  category?: string;
  limit?: number;
}

// ============================================================================
// HELPER: Check Feature Flags
// ============================================================================

async function isDualReadEnabled(
  tenantId: string,
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("exo_tenants")
    .select("iors_behavior_presets")
    .eq("id", tenantId)
    .single();

  if (error || !data) {
    console.warn("[DualRead] Failed to check feature flags:", error);
    return false;
  }

  const presets = data.iors_behavior_presets as Record<string, unknown> | null;
  return presets?.quest_system_dual_read === true;
}

// ============================================================================
// HELPER: Reverse Map Status Values
// ============================================================================

function reverseMapTaskStatus(
  tyrolkaStatus: "pending" | "active" | "completed" | "dropped" | "blocked",
): "pending" | "in_progress" | "done" | "cancelled" | "blocked" {
  const mapping: Record<
    string,
    "pending" | "in_progress" | "done" | "cancelled" | "blocked"
  > = {
    pending: "pending",
    active: "in_progress",
    completed: "done",
    dropped: "cancelled",
    blocked: "blocked",
  };
  return mapping[tyrolkaStatus] || "pending";
}

function reverseMapTaskPriority(tyrolkaPriority: number): number {
  if (tyrolkaPriority >= 8) return 1;
  if (tyrolkaPriority >= 6) return 2;
  if (tyrolkaPriority >= 4) return 3;
  return 4;
}

function reverseMapGoalStatus(tyrolkaStatus: string): boolean {
  return tyrolkaStatus === "active";
}

// ============================================================================
// DUAL-READ: TASKS / OPS
// ============================================================================

export async function dualReadTask(
  taskId: string,
  tenantId: string,
  supabaseClient?: SupabaseClient,
): Promise<Task | null> {
  const supabase = supabaseClient || getServiceSupabase();
  const dualReadEnabled = await isDualReadEnabled(tenantId, supabase);

  if (!dualReadEnabled) {
    const { data, error } = await supabase
      .from("exo_tasks")
      .select("*")
      .eq("id", taskId)
      .eq("tenant_id", tenantId)
      .single();

    if (error || !data) return null;
    return { ...data, _source: "legacy", _migrated: false } as Task;
  }

  // Try Tyrolka first (user_ops)
  const { data: tyrolkaOp, error: tyrolkaError } = await supabase
    .from("user_ops")
    .select("*")
    .eq("id", taskId)
    .eq("tenant_id", tenantId)
    .single();

  if (tyrolkaOp && !tyrolkaError) {
    return {
      id: tyrolkaOp.id,
      tenant_id: tyrolkaOp.tenant_id,
      title: tyrolkaOp.title,
      description: tyrolkaOp.description,
      status: reverseMapTaskStatus(tyrolkaOp.status as any),
      priority: reverseMapTaskPriority(tyrolkaOp.priority),
      due_date: tyrolkaOp.due_date,
      created_at: tyrolkaOp.created_at,
      updated_at: tyrolkaOp.updated_at,
      completed_at: tyrolkaOp.completed_at,
      _source: "tyrolka",
      _migrated: true,
    };
  }

  // Fallback to legacy (exo_tasks)
  const { data: legacyTask, error: legacyError } = await supabase
    .from("exo_tasks")
    .select("*")
    .eq("id", taskId)
    .eq("tenant_id", tenantId)
    .single();

  if (legacyError || !legacyTask) return null;
  return { ...legacyTask, _source: "legacy", _migrated: false } as Task;
}

export async function dualReadTasks(
  tenantId: string,
  filters?: TaskFilters,
  supabaseClient?: SupabaseClient,
): Promise<Task[]> {
  const supabase = supabaseClient || getServiceSupabase();
  const dualReadEnabled = await isDualReadEnabled(tenantId, supabase);

  if (!dualReadEnabled) {
    let query = supabase
      .from("exo_tasks")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.overdue)
      query = query.lt("due_date", new Date().toISOString());
    if (filters?.limit) query = query.limit(filters.limit);

    const { data, error } = await query;
    if (error || !data) return [];
    return data.map((t) => ({
      ...t,
      _source: "legacy" as const,
      _migrated: false,
    }));
  }

  // Read from Tyrolka (user_ops)
  let tyrolkaQuery = supabase
    .from("user_ops")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (filters?.status) {
    const tyrolkaStatus =
      {
        pending: "pending",
        in_progress: "active",
        done: "completed",
        cancelled: "dropped",
        blocked: "blocked",
      }[filters.status] || filters.status;
    tyrolkaQuery = tyrolkaQuery.eq("status", tyrolkaStatus);
  }

  if (filters?.overdue)
    tyrolkaQuery = tyrolkaQuery.lt("due_date", new Date().toISOString());
  if (filters?.limit) tyrolkaQuery = tyrolkaQuery.limit(filters.limit);

  const { data: tyrolkaOps, error: tyrolkaError } = await tyrolkaQuery;
  if (tyrolkaError) {
    console.error(
      "[DualRead] Tyrolka ops query failed, falling back to legacy:",
      tyrolkaError,
    );
  }

  // Get migration map
  const { data: migrationMap } = await supabase
    .from("exo_migration_map")
    .select("legacy_id, new_id")
    .eq("tenant_id", tenantId)
    .eq("legacy_type", "exo_tasks");

  const migratedIds = new Set((migrationMap || []).map((m) => m.legacy_id));

  // Read legacy (non-migrated only)
  let legacyQuery = supabase
    .from("exo_tasks")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (filters?.status) legacyQuery = legacyQuery.eq("status", filters.status);
  if (filters?.overdue)
    legacyQuery = legacyQuery.lt("due_date", new Date().toISOString());

  const { data: legacyTasks } = await legacyQuery;

  // Merge
  const tyrolkaMapped: Task[] = (tyrolkaOps || []).map((op) => ({
    id: op.id,
    tenant_id: op.tenant_id,
    title: op.title,
    description: op.description,
    status: reverseMapTaskStatus(op.status as any),
    priority: reverseMapTaskPriority(op.priority),
    due_date: op.due_date,
    created_at: op.created_at,
    updated_at: op.updated_at,
    completed_at: op.completed_at,
    _source: "tyrolka" as const,
    _migrated: true,
  }));

  const legacyMapped: Task[] = (legacyTasks || [])
    .filter((task) => !migratedIds.has(task.id))
    .map((task) => ({ ...task, _source: "legacy" as const, _migrated: false }));

  const allTasks = [...tyrolkaMapped, ...legacyMapped];
  allTasks.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  if (filters?.limit) return allTasks.slice(0, filters.limit);
  return allTasks;
}

// ============================================================================
// DUAL-READ: GOALS / QUESTS
// ============================================================================

export async function dualReadGoal(
  goalId: string,
  tenantId: string,
  supabaseClient?: SupabaseClient,
): Promise<Goal | null> {
  const supabase = supabaseClient || getServiceSupabase();
  const dualReadEnabled = await isDualReadEnabled(tenantId, supabase);

  if (!dualReadEnabled) {
    const { data, error } = await supabase
      .from("exo_user_goals")
      .select("*")
      .eq("id", goalId)
      .eq("tenant_id", tenantId)
      .single();

    if (error || !data) return null;
    return { ...data, _source: "legacy", _migrated: false } as Goal;
  }

  // Try Tyrolka first
  const { data: tyrolkaQuest, error: tyrolkaError } = await supabase
    .from("user_quests")
    .select("*")
    .eq("id", goalId)
    .eq("tenant_id", tenantId)
    .single();

  if (tyrolkaQuest && !tyrolkaError) {
    return {
      id: tyrolkaQuest.id,
      tenant_id: tyrolkaQuest.tenant_id,
      name: tyrolkaQuest.title,
      description: tyrolkaQuest.description,
      category: tyrolkaQuest.loop_slug || "productivity",
      is_active: reverseMapGoalStatus(tyrolkaQuest.status),
      start_date: tyrolkaQuest.start_date,
      target_date: tyrolkaQuest.deadline,
      created_at: tyrolkaQuest.created_at,
      updated_at: tyrolkaQuest.updated_at,
      _source: "tyrolka",
      _migrated: true,
    };
  }

  // Fallback to legacy
  const { data: legacyGoal, error: legacyError } = await supabase
    .from("exo_user_goals")
    .select("*")
    .eq("id", goalId)
    .eq("tenant_id", tenantId)
    .single();

  if (legacyError || !legacyGoal) return null;
  return { ...legacyGoal, _source: "legacy", _migrated: false } as Goal;
}

export async function dualReadGoals(
  tenantId: string,
  filters?: GoalFilters,
  supabaseClient?: SupabaseClient,
): Promise<Goal[]> {
  const supabase = supabaseClient || getServiceSupabase();
  const dualReadEnabled = await isDualReadEnabled(tenantId, supabase);

  if (!dualReadEnabled) {
    let query = supabase
      .from("exo_user_goals")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (filters?.is_active !== undefined)
      query = query.eq("is_active", filters.is_active);
    if (filters?.category) query = query.eq("category", filters.category);
    if (filters?.limit) query = query.limit(filters.limit);

    const { data, error } = await query;
    if (error || !data) return [];
    return data.map((g) => ({
      ...g,
      _source: "legacy" as const,
      _migrated: false,
    }));
  }

  // Read from Tyrolka
  let tyrolkaQuery = supabase
    .from("user_quests")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (filters?.is_active !== undefined) {
    tyrolkaQuery = tyrolkaQuery.eq(
      "status",
      filters.is_active ? "active" : "archived",
    );
  }
  if (filters?.category)
    tyrolkaQuery = tyrolkaQuery.eq("loop_slug", filters.category);
  if (filters?.limit) tyrolkaQuery = tyrolkaQuery.limit(filters.limit);

  const { data: tyrolkaQuests, error: tyrolkaError } = await tyrolkaQuery;
  if (tyrolkaError) {
    console.error("[DualRead] Tyrolka quests query failed:", tyrolkaError);
  }

  // Get migration map
  const { data: migrationMap } = await supabase
    .from("exo_migration_map")
    .select("legacy_id, new_id")
    .eq("tenant_id", tenantId)
    .eq("legacy_type", "exo_user_goals");

  const migratedIds = new Set((migrationMap || []).map((m) => m.legacy_id));

  // Read legacy (non-migrated only)
  let legacyQuery = supabase
    .from("exo_user_goals")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (filters?.is_active !== undefined)
    legacyQuery = legacyQuery.eq("is_active", filters.is_active);
  if (filters?.category)
    legacyQuery = legacyQuery.eq("category", filters.category);

  const { data: legacyGoals } = await legacyQuery;

  // Merge
  const tyrolkaMapped: Goal[] = (tyrolkaQuests || []).map((quest) => ({
    id: quest.id,
    tenant_id: quest.tenant_id,
    name: quest.title,
    description: quest.description,
    category: quest.loop_slug || "productivity",
    is_active: reverseMapGoalStatus(quest.status),
    start_date: quest.start_date,
    target_date: quest.deadline,
    created_at: quest.created_at,
    updated_at: quest.updated_at,
    _source: "tyrolka" as const,
    _migrated: true,
  }));

  const legacyMapped: Goal[] = (legacyGoals || [])
    .filter((goal) => !migratedIds.has(goal.id))
    .map((goal) => ({ ...goal, _source: "legacy" as const, _migrated: false }));

  const allGoals = [...tyrolkaMapped, ...legacyMapped];
  allGoals.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  if (filters?.limit) return allGoals.slice(0, filters.limit);
  return allGoals;
}
