/**
 * Goal Service — Centralized data access layer for goals
 *
 * All goal read/write operations go through here.
 * Internally uses dual-write/dual-read for Tyrolka migration transparency.
 * Defaults to service-role client (works in IORS tools, CRONs, API routes).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { dualWriteGoal, dualUpdateGoal } from "@/lib/tasks/dual-write";
import type { GoalInput, GoalOutput } from "@/lib/tasks/dual-write";
import { dualReadGoal, dualReadGoals } from "@/lib/tasks/dual-read";
import type { Goal, GoalFilters } from "@/lib/tasks/dual-read";

export type { Goal, GoalInput, GoalOutput, GoalFilters };

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

export async function createGoal(
  tenantId: string,
  input: GoalInput,
  supabase?: SupabaseClient,
): Promise<GoalOutput> {
  return dualWriteGoal(tenantId, input, supabase);
}

export async function updateGoal(
  goalId: string,
  tenantId: string,
  updates: Partial<GoalInput>,
  supabase?: SupabaseClient,
): Promise<{ success: boolean; error?: string }> {
  return dualUpdateGoal(goalId, tenantId, updates, supabase);
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

export async function getGoal(
  goalId: string,
  tenantId: string,
  supabase?: SupabaseClient,
): Promise<Goal | null> {
  return dualReadGoal(goalId, tenantId, supabase);
}

export async function getGoals(
  tenantId: string,
  filters?: GoalFilters,
  supabase?: SupabaseClient,
): Promise<Goal[]> {
  return dualReadGoals(tenantId, filters, supabase);
}

export async function getActiveGoalCount(
  tenantId: string,
  supabase?: SupabaseClient,
): Promise<number> {
  const goals = await dualReadGoals(tenantId, { is_active: true }, supabase);
  return goals.length;
}
