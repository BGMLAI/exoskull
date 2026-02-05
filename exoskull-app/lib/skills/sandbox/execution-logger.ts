// =====================================================
// EXECUTION LOGGER - Writes to exo_skill_execution_log
// =====================================================

import { createClient } from "@supabase/supabase-js";
import { SkillExecutionResult, SkillExecutionContext } from "../types";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Log a skill execution to the audit trail table.
 * Called after every sandbox execution, success or failure.
 * The DB trigger automatically increments usage_count on the skill.
 */
export async function logExecution(
  context: SkillExecutionContext,
  result: SkillExecutionResult,
  action?: string,
  params?: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = getServiceSupabase();

    await supabase.from("exo_skill_execution_log").insert({
      tenant_id: context.tenant_id,
      skill_id: context.skill_id,
      action: action || context.method,
      params: params || null,
      result: result.success ? result.result : null,
      success: result.success,
      error_message: result.error || null,
      execution_time_ms: Math.round(result.executionTimeMs),
      memory_used_mb: result.memoryUsedMb || null,
    });
  } catch (error) {
    // Don't throw on logging errors - execution should still succeed
    console.error("[ExecutionLogger] Failed to log execution:", {
      error: (error as Error).message,
      skill_id: context.skill_id,
      method: context.method,
    });
  }
}
