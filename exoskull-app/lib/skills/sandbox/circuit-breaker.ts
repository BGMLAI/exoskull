// =====================================================
// SKILL CIRCUIT BREAKER
// Auto-revokes skills with high error rates
//
// Inline: called after each execution (fire-and-forget)
// CRON: batch sweep in skill-lifecycle
// =====================================================

import { createClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
const MIN_EXECUTIONS = 10;
const ERROR_RATE_THRESHOLD = 0.3; // 30%
const LOOKBACK_WINDOW = 50;

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Check if a skill should be circuit-broken based on recent error rate.
 * Called after each execution (fire-and-forget, non-blocking).
 */
export async function checkCircuitBreaker(
  skillId: string,
  tenantId: string,
): Promise<{ tripped: boolean; errorRate?: number }> {
  try {
    const supabase = getServiceSupabase();

    // Get recent execution results
    const { data: logs, error } = await supabase
      .from("exo_skill_execution_log")
      .select("success")
      .eq("skill_id", skillId)
      .order("created_at", { ascending: false })
      .limit(LOOKBACK_WINDOW);

    if (error || !logs || logs.length < MIN_EXECUTIONS) {
      return { tripped: false };
    }

    const totalExecutions = logs.length;
    const errorCount = logs.filter((l) => !l.success).length;
    const errorRate = errorCount / totalExecutions;

    if (errorRate > ERROR_RATE_THRESHOLD) {
      // Revoke the skill
      const { error: revokeError } = await supabase
        .from("exo_generated_skills")
        .update({
          approval_status: "revoked",
          rejection_reason: `Auto-revoked: ${Math.round(errorRate * 100)}% error rate over ${totalExecutions} executions`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", skillId)
        .eq("tenant_id", tenantId);

      if (revokeError) {
        console.error("[CircuitBreaker] Revoke failed:", {
          error: revokeError.message,
          skillId,
        });
        return { tripped: false };
      }

      logger.warn(
        `[CircuitBreaker] Skill ${skillId} revoked: ${Math.round(errorRate * 100)}% error rate over ${totalExecutions} executions`,
      );
      return { tripped: true, errorRate };
    }

    return { tripped: false };
  } catch (error) {
    console.error("[CircuitBreaker] Check failed:", {
      error: error instanceof Error ? error.message : error,
      skillId,
    });
    return { tripped: false };
  }
}

/**
 * Batch sweep: revoke all unhealthy skills across all tenants.
 * Called from skill-lifecycle CRON.
 */
export async function revokeUnhealthySkills(
  minExecutions: number = MIN_EXECUTIONS,
  errorThreshold: number = ERROR_RATE_THRESHOLD,
): Promise<{ revokedCount: number; skills: string[] }> {
  try {
    const supabase = getServiceSupabase();

    // Get all approved, non-archived skills
    const { data: activeSkills, error: loadError } = await supabase
      .from("exo_generated_skills")
      .select("id, tenant_id, name, slug")
      .eq("approval_status", "approved")
      .is("archived_at", null);

    if (loadError || !activeSkills || activeSkills.length === 0) {
      return { revokedCount: 0, skills: [] };
    }

    const revoked: string[] = [];

    for (const skill of activeSkills) {
      const result = await checkCircuitBreaker(skill.id, skill.tenant_id);
      if (result.tripped) {
        revoked.push(
          `${skill.slug} (${Math.round((result.errorRate || 0) * 100)}%)`,
        );
      }
    }

    if (revoked.length > 0) {
      logger.info(
        `[CircuitBreaker] CRON sweep: revoked ${revoked.length} unhealthy skills: ${revoked.join(", ")}`,
      );
    }

    return { revokedCount: revoked.length, skills: revoked };
  } catch (error) {
    console.error("[CircuitBreaker] Batch sweep failed:", error);
    return { revokedCount: 0, skills: [] };
  }
}
