/**
 * System Metrics Collector — L10 Self-Optimization
 *
 * Collects system-level performance metrics from existing tables.
 * Used by MAPE-K Monitor phase to feed into Analyze decisions.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { SystemMetrics } from "../autonomy/types";

import { logger } from "@/lib/logger";
// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Collect system metrics for a tenant from existing tables.
 * All queries run in parallel. Returns defaults on failure (non-blocking).
 */
export async function collectSystemMetrics(
  tenantId: string,
): Promise<SystemMetrics> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  try {
    const [
      mapekResult,
      skillResult,
      interventionResult,
      usageResult,
      learningResult,
    ] = await Promise.all([
      collectMapekMetrics(supabase, tenantId, weekAgo),
      collectSkillMetrics(supabase, tenantId, weekAgo),
      collectInterventionMetrics(supabase, tenantId, weekAgo),
      collectAiUsage(supabase, tenantId, todayStart),
      collectLearningMetrics(supabase, tenantId, weekAgo),
    ]);

    return {
      mapekCycles: mapekResult,
      skillHealth: skillResult,
      interventionEffectiveness: interventionResult,
      aiUsage: usageResult,
      learningEvents: learningResult,
    };
  } catch (error) {
    logger.error("[SystemMetrics] Collection failed:", {
      error: error instanceof Error ? error.message : error,
      tenantId,
    });
    return getDefaultMetrics();
  }
}

// ============================================================================
// COLLECTORS
// ============================================================================

async function collectMapekMetrics(
  supabase: SupabaseClient,
  tenantId: string,
  since: Date,
): Promise<SystemMetrics["mapekCycles"]> {
  const { data } = await supabase
    .from("exo_mapek_cycles")
    .select("status, duration_ms")
    .eq("tenant_id", tenantId)
    .gte("created_at", since.toISOString());

  if (!data || data.length === 0) {
    return { total: 0, successRate: 1, avgDurationMs: 0 };
  }

  const successful = data.filter((c) => c.status === "completed").length;
  const avgDuration =
    data.reduce((sum, c) => sum + (c.duration_ms || 0), 0) / data.length;

  return {
    total: data.length,
    successRate: Math.round((successful / data.length) * 100) / 100,
    avgDurationMs: Math.round(avgDuration),
  };
}

async function collectSkillMetrics(
  supabase: SupabaseClient,
  tenantId: string,
  since: Date,
): Promise<SystemMetrics["skillHealth"]> {
  const { data } = await supabase
    .from("exo_skill_execution_log")
    .select("success, execution_time_ms")
    .eq("tenant_id", tenantId)
    .gte("executed_at", since.toISOString());

  if (!data || data.length === 0) {
    return { totalExecutions: 0, errorRate: 0, avgExecutionMs: 0 };
  }

  const failures = data.filter((e) => !e.success).length;
  const avgTime =
    data.reduce((sum, e) => sum + (e.execution_time_ms || 0), 0) / data.length;

  return {
    totalExecutions: data.length,
    errorRate: Math.round((failures / data.length) * 100) / 100,
    avgExecutionMs: Math.round(avgTime),
  };
}

async function collectInterventionMetrics(
  supabase: SupabaseClient,
  tenantId: string,
  since: Date,
): Promise<SystemMetrics["interventionEffectiveness"]> {
  const { data } = await supabase
    .from("exo_interventions")
    .select("status, user_feedback")
    .eq("tenant_id", tenantId)
    .gte("created_at", since.toISOString());

  if (!data || data.length === 0) {
    return { approvalRate: 1, executionRate: 1, helpfulRate: 0.5 };
  }

  const approved = data.filter(
    (i) => i.status === "approved" || i.status === "completed",
  ).length;
  const executed = data.filter((i) => i.status === "completed").length;
  const withFeedback = data.filter((i) => i.user_feedback !== null);
  const helpful = withFeedback.filter(
    (i) => i.user_feedback === "helpful",
  ).length;

  return {
    approvalRate: Math.round((approved / data.length) * 100) / 100,
    executionRate: Math.round((executed / data.length) * 100) / 100,
    helpfulRate:
      withFeedback.length > 0
        ? Math.round((helpful / withFeedback.length) * 100) / 100
        : 0.5,
  };
}

async function collectAiUsage(
  supabase: SupabaseClient,
  tenantId: string,
  todayStart: Date,
): Promise<SystemMetrics["aiUsage"]> {
  const { data } = await supabase
    .from("exo_usage_daily")
    .select("ai_requests_count, tokens_used, voice_minutes")
    .eq("tenant_id", tenantId)
    .gte("usage_date", todayStart.toISOString().split("T")[0])
    .limit(1)
    .maybeSingle();

  return {
    requestsToday: data?.ai_requests_count || 0,
    tokensToday: data?.tokens_used || 0,
    voiceMinutesToday: data?.voice_minutes || 0,
  };
}

async function collectLearningMetrics(
  supabase: SupabaseClient,
  tenantId: string,
  since: Date,
): Promise<SystemMetrics["learningEvents"]> {
  const { data } = await supabase
    .from("learning_events")
    .select("event_type")
    .eq("tenant_id", tenantId)
    .gte("created_at", since.toISOString());

  if (!data || data.length === 0) {
    return { patternsDetected7d: 0, insightsGenerated7d: 0 };
  }

  const patterns = data.filter(
    (e) => e.event_type === "pattern_detected",
  ).length;

  return {
    patternsDetected7d: patterns,
    insightsGenerated7d: data.length,
  };
}

// ============================================================================
// DEFAULTS
// ============================================================================

function getDefaultMetrics(): SystemMetrics {
  return {
    mapekCycles: { total: 0, successRate: 1, avgDurationMs: 0 },
    skillHealth: { totalExecutions: 0, errorRate: 0, avgExecutionMs: 0 },
    interventionEffectiveness: {
      approvalRate: 1,
      executionRate: 1,
      helpfulRate: 0.5,
    },
    aiUsage: { requestsToday: 0, tokensToday: 0, voiceMinutesToday: 0 },
    learningEvents: { patternsDetected7d: 0, insightsGenerated7d: 0 },
  };
}
