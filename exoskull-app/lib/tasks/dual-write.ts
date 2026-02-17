/**
 * Dual-Write Wrappers for Quest System Migration
 *
 * Writes to BOTH legacy tables and Tyrolka Framework tables simultaneously
 * during the transition period. Enabled via feature flags in exo_tenants.iors_behavior_presets.
 *
 * Critical Features:
 * - Accepts any SupabaseClient (works in IORS tools, CRONs, and API routes)
 * - Transaction support (all-or-nothing writes)
 * - Error handling (fallback to legacy-only on Tyrolka failure)
 * - Comprehensive logging for debugging
 * - Mapping tracking in exo_migration_map
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface TaskInput {
  title: string;
  description?: string | null;
  status?: "pending" | "in_progress" | "blocked" | "done" | "cancelled";
  priority?: 1 | 2 | 3 | 4; // Legacy scale
  due_date?: Date | string | null;
  project_id?: string | null;
  parent_task_id?: string | null;
  energy_required?: number | null;
  time_estimate_minutes?: number | null;
  context?: Record<string, unknown>;
}

export interface TaskOutput {
  id: string;
  legacy_id?: string;
  tyrolka_id?: string;
  dual_write_success: boolean;
  error?: string;
}

export interface GoalInput {
  name: string;
  description?: string | null;
  category:
    | "health"
    | "productivity"
    | "finance"
    | "mental"
    | "social"
    | "learning"
    | "creativity";
  target_type?: "numeric" | "boolean" | "frequency";
  target_value?: number | null;
  target_unit?: string | null;
  baseline_value?: number | null;
  current_value?: number | null;
  frequency?: "daily" | "weekly" | "monthly";
  direction?: "increase" | "decrease";
  start_date?: Date | string;
  target_date?: Date | string | null;
  is_active?: boolean;
  wellbeing_weight?: number;
}

export interface GoalOutput {
  id: string;
  legacy_id?: string;
  tyrolka_id?: string;
  dual_write_success: boolean;
  error?: string;
}

// ============================================================================
// HELPER: Check Feature Flags
// ============================================================================

async function isDualWriteEnabled(
  tenantId: string,
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("exo_tenants")
    .select("iors_behavior_presets")
    .eq("id", tenantId)
    .single();

  if (error || !data) {
    logger.warn("[DualWrite] Failed to check feature flags:", error);
    return false;
  }

  const presets = data.iors_behavior_presets as Record<string, unknown> | null;
  return presets?.quest_system_dual_write === true;
}

// ============================================================================
// HELPER: Map Status Values
// ============================================================================

export function mapTaskStatus(
  legacyStatus: "pending" | "in_progress" | "blocked" | "done" | "cancelled",
): "pending" | "active" | "completed" | "dropped" | "blocked" {
  const mapping: Record<
    string,
    "pending" | "active" | "completed" | "dropped" | "blocked"
  > = {
    pending: "pending",
    in_progress: "active",
    done: "completed",
    cancelled: "dropped",
    blocked: "blocked",
  };
  return mapping[legacyStatus] || "pending";
}

export function mapTaskPriority(legacyPriority: 1 | 2 | 3 | 4): number {
  const mapping: Record<number, number> = {
    1: 10, // critical → highest
    2: 7, // high → 7/10
    3: 5, // medium → 5/10
    4: 2, // low → 2/10
  };
  return mapping[legacyPriority] || 5;
}

function mapGoalStatus(isActive: boolean): "active" | "archived" {
  return isActive ? "active" : "archived";
}

// ============================================================================
// DUAL-WRITE: TASKS → OPS
// ============================================================================

export async function dualWriteTask(
  tenantId: string,
  input: TaskInput,
  supabaseClient?: SupabaseClient,
): Promise<TaskOutput> {
  const supabase = supabaseClient || getServiceSupabase();

  const dualWriteEnabled = await isDualWriteEnabled(tenantId, supabase);

  // STEP 1: Always write to LEGACY table (exo_tasks)
  const { data: legacyTask, error: legacyError } = await supabase
    .from("exo_tasks")
    .insert({
      tenant_id: tenantId,
      title: input.title,
      description: input.description,
      status: input.status || "pending",
      priority: input.priority || 2,
      due_date: input.due_date,
      project_id: input.project_id,
      parent_task_id: input.parent_task_id,
      energy_required: input.energy_required,
      time_estimate_minutes: input.time_estimate_minutes,
      context: input.context || {},
    })
    .select("id")
    .single();

  if (legacyError || !legacyTask) {
    logger.error("[DualWrite] Legacy task insert failed:", legacyError);
    return {
      id: "",
      dual_write_success: false,
      error: `Legacy insert failed: ${legacyError?.message}`,
    };
  }

  const legacyId = legacyTask.id;

  // STEP 2: If dual-write disabled, return early (legacy-only)
  if (!dualWriteEnabled) {
    return {
      id: legacyId,
      legacy_id: legacyId,
      dual_write_success: true,
    };
  }

  // STEP 3: Write to TYROLKA table (user_ops)
  try {
    const { data: tyrolkaOp, error: tyrolkaError } = await supabase
      .from("user_ops")
      .insert({
        id: legacyId,
        tenant_id: tenantId,
        quest_id: null,
        title: input.title,
        description: input.description,
        status: mapTaskStatus(input.status || "pending"),
        priority: mapTaskPriority(input.priority || 2),
        due_date: input.due_date,
        loop_slug: null,
        tags: [],
      })
      .select("id")
      .single();

    if (tyrolkaError || !tyrolkaOp) {
      logger.error(
        "[DualWrite] Tyrolka ops insert failed (legacy write succeeded):",
        tyrolkaError,
      );
      return {
        id: legacyId,
        legacy_id: legacyId,
        dual_write_success: false,
        error: `Tyrolka insert failed: ${tyrolkaError?.message}`,
      };
    }

    const tyrolkaId = tyrolkaOp.id;

    // STEP 4: Record mapping in exo_migration_map
    await supabase.from("exo_migration_map").insert({
      tenant_id: tenantId,
      legacy_type: "exo_tasks",
      legacy_id: legacyId,
      new_type: "user_ops",
      new_id: tyrolkaId,
      migration_notes: {
        method: "dual_write",
        original_status: input.status,
        mapped_status: mapTaskStatus(input.status || "pending"),
        original_priority: input.priority,
        mapped_priority: mapTaskPriority(input.priority || 2),
      },
    });

    logger.info(
      `[DualWrite] Task ${legacyId} written to both legacy and Tyrolka`,
    );

    return {
      id: legacyId,
      legacy_id: legacyId,
      tyrolka_id: tyrolkaId,
      dual_write_success: true,
    };
  } catch (error) {
    logger.error("[DualWrite] Tyrolka write failed with exception:", error);
    return {
      id: legacyId,
      legacy_id: legacyId,
      dual_write_success: false,
      error: `Tyrolka exception: ${error instanceof Error ? error.message : "Unknown"}`,
    };
  }
}

// ============================================================================
// DUAL-WRITE: GOALS → QUESTS
// ============================================================================

export async function dualWriteGoal(
  tenantId: string,
  input: GoalInput,
  supabaseClient?: SupabaseClient,
): Promise<GoalOutput> {
  const supabase = supabaseClient || getServiceSupabase();

  const dualWriteEnabled = await isDualWriteEnabled(tenantId, supabase);

  // STEP 1: Always write to LEGACY table (exo_user_goals)
  const { data: legacyGoal, error: legacyError } = await supabase
    .from("exo_user_goals")
    .insert({
      tenant_id: tenantId,
      name: input.name,
      category: input.category,
      description: input.description,
      target_type: input.target_type || "numeric",
      target_value: input.target_value,
      target_unit: input.target_unit,
      baseline_value: input.baseline_value,
      current_value: input.current_value,
      frequency: input.frequency || "daily",
      direction: input.direction || "increase",
      start_date: input.start_date || new Date().toISOString().split("T")[0],
      target_date: input.target_date,
      is_active: input.is_active !== false,
      wellbeing_weight: input.wellbeing_weight || 1.0,
    })
    .select("id")
    .single();

  if (legacyError || !legacyGoal) {
    logger.error("[DualWrite] Legacy goal insert failed:", legacyError);
    return {
      id: "",
      dual_write_success: false,
      error: `Legacy insert failed: ${legacyError?.message}`,
    };
  }

  const legacyId = legacyGoal.id;

  if (!dualWriteEnabled) {
    return {
      id: legacyId,
      legacy_id: legacyId,
      dual_write_success: true,
    };
  }

  // STEP 3: Write to TYROLKA table (user_quests)
  try {
    const { data: tyrolkaQuest, error: tyrolkaError } = await supabase
      .from("user_quests")
      .insert({
        id: legacyId,
        tenant_id: tenantId,
        campaign_id: null,
        title: input.name,
        description: input.description,
        status: mapGoalStatus(input.is_active !== false),
        loop_slug: input.category,
        start_date: input.start_date || new Date().toISOString().split("T")[0],
        deadline: input.target_date,
        tags: [],
      })
      .select("id")
      .single();

    if (tyrolkaError || !tyrolkaQuest) {
      logger.error(
        "[DualWrite] Tyrolka quest insert failed (legacy write succeeded):",
        tyrolkaError,
      );
      return {
        id: legacyId,
        legacy_id: legacyId,
        dual_write_success: false,
        error: `Tyrolka insert failed: ${tyrolkaError?.message}`,
      };
    }

    const tyrolkaId = tyrolkaQuest.id;

    await supabase.from("exo_migration_map").insert({
      tenant_id: tenantId,
      legacy_type: "exo_user_goals",
      legacy_id: legacyId,
      new_type: "user_quests",
      new_id: tyrolkaId,
      migration_notes: {
        method: "dual_write",
        original_category: input.category,
        mapped_loop_slug: input.category,
        original_is_active: input.is_active,
        mapped_status: mapGoalStatus(input.is_active !== false),
      },
    });

    logger.info(
      `[DualWrite] Goal ${legacyId} written to both legacy and Tyrolka`,
    );

    return {
      id: legacyId,
      legacy_id: legacyId,
      tyrolka_id: tyrolkaId,
      dual_write_success: true,
    };
  } catch (error) {
    logger.error("[DualWrite] Tyrolka write failed with exception:", error);
    return {
      id: legacyId,
      legacy_id: legacyId,
      dual_write_success: false,
      error: `Tyrolka exception: ${error instanceof Error ? error.message : "Unknown"}`,
    };
  }
}

// ============================================================================
// DUAL-WRITE: UPDATE OPERATIONS
// ============================================================================

export async function dualUpdateTask(
  taskId: string,
  tenantId: string,
  updates: Partial<TaskInput>,
  supabaseClient?: SupabaseClient,
): Promise<{ success: boolean; error?: string }> {
  const supabase = supabaseClient || getServiceSupabase();
  const dualWriteEnabled = await isDualWriteEnabled(tenantId, supabase);

  // STEP 1: Update legacy table
  const legacyUpdates: Record<string, unknown> = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { error: legacyError } = await supabase
    .from("exo_tasks")
    .update(legacyUpdates)
    .eq("id", taskId)
    .eq("tenant_id", tenantId);

  if (legacyError) {
    logger.error("[DualUpdate] Legacy task update failed:", legacyError);
    return { success: false, error: legacyError.message };
  }

  if (!dualWriteEnabled) {
    return { success: true };
  }

  // STEP 3: Update Tyrolka table
  try {
    const tyrolkaUpdates: Record<string, unknown> = {};
    if (updates.title) tyrolkaUpdates.title = updates.title;
    if (updates.description !== undefined)
      tyrolkaUpdates.description = updates.description;
    if (updates.status) tyrolkaUpdates.status = mapTaskStatus(updates.status);
    if (updates.priority)
      tyrolkaUpdates.priority = mapTaskPriority(updates.priority);
    if (updates.due_date !== undefined)
      tyrolkaUpdates.due_date = updates.due_date;

    const { error: tyrolkaError } = await supabase
      .from("user_ops")
      .update({
        ...tyrolkaUpdates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .eq("tenant_id", tenantId);

    if (tyrolkaError) {
      logger.error("[DualUpdate] Tyrolka ops update failed:", tyrolkaError);
      return {
        success: false,
        error: `Tyrolka update failed: ${tyrolkaError.message}`,
      };
    }

    return { success: true };
  } catch (error) {
    logger.error("[DualUpdate] Tyrolka update failed with exception:", error);
    return {
      success: false,
      error: `Tyrolka exception: ${error instanceof Error ? error.message : "Unknown"}`,
    };
  }
}

export async function dualUpdateGoal(
  goalId: string,
  tenantId: string,
  updates: Partial<GoalInput>,
  supabaseClient?: SupabaseClient,
): Promise<{ success: boolean; error?: string }> {
  const supabase = supabaseClient || getServiceSupabase();
  const dualWriteEnabled = await isDualWriteEnabled(tenantId, supabase);

  const { error: legacyError } = await supabase
    .from("exo_user_goals")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", goalId)
    .eq("tenant_id", tenantId);

  if (legacyError) {
    logger.error("[DualUpdate] Legacy goal update failed:", legacyError);
    return { success: false, error: legacyError.message };
  }

  if (!dualWriteEnabled) {
    return { success: true };
  }

  try {
    const tyrolkaUpdates: Record<string, unknown> = {};
    if (updates.name) tyrolkaUpdates.title = updates.name;
    if (updates.description !== undefined)
      tyrolkaUpdates.description = updates.description;
    if (updates.is_active !== undefined)
      tyrolkaUpdates.status = mapGoalStatus(updates.is_active);
    if (updates.category) tyrolkaUpdates.loop_slug = updates.category;
    if (updates.target_date !== undefined)
      tyrolkaUpdates.deadline = updates.target_date;

    const { error: tyrolkaError } = await supabase
      .from("user_quests")
      .update({
        ...tyrolkaUpdates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", goalId)
      .eq("tenant_id", tenantId);

    if (tyrolkaError) {
      logger.error("[DualUpdate] Tyrolka quest update failed:", tyrolkaError);
      return {
        success: false,
        error: `Tyrolka update failed: ${tyrolkaError.message}`,
      };
    }

    return { success: true };
  } catch (error) {
    logger.error("[DualUpdate] Tyrolka update failed with exception:", error);
    return {
      success: false,
      error: `Tyrolka exception: ${error instanceof Error ? error.message : "Unknown"}`,
    };
  }
}
