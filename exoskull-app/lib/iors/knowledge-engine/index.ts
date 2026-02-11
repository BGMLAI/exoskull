/**
 * Knowledge Analysis Engine (KAE) — Orchestrator
 *
 * Two modes:
 * - Light: Rule-based anomaly detection ($0 cost), runs in loop-15
 * - Deep: AI-powered holistic analysis (~$0.01-0.05), runs in loop-daily
 *
 * Both modes flow through the same pipeline:
 * Collect → Analyze → Route Actions → Store Results
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { collectKnowledgeSnapshot, hashSnapshot } from "./collector";
import { synthesizeKnowledge, lightAnalysis } from "./synthesizer";
import { routeKnowledgeActions } from "./action-router";
import type {
  AnalysisType,
  AnalysisTrigger,
  KnowledgeAnalysisResult,
} from "./types";

/**
 * Run knowledge analysis for a tenant.
 */
export async function runKnowledgeAnalysis(
  tenantId: string,
  analysisType: AnalysisType = "deep",
  trigger: AnalysisTrigger = "loop_daily",
): Promise<KnowledgeAnalysisResult> {
  const startTime = Date.now();
  const supabase = getServiceSupabase();

  logger.info("[KAE] Starting analysis:", {
    tenantId,
    analysisType,
    trigger,
  });

  // 1. Collect snapshot
  const snapshot = await collectKnowledgeSnapshot(tenantId);
  const snapshotHash = hashSnapshot(snapshot);

  // 2. Check for duplicate runs (same data, same day)
  if (analysisType === "deep") {
    const { data: existing } = await supabase
      .from("exo_knowledge_analyses")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("snapshot_hash", snapshotHash)
      .limit(1)
      .single();

    if (existing) {
      logger.info("[KAE] Skipping duplicate analysis (same data):", {
        tenantId,
        hash: snapshotHash,
      });
      return {
        tenantId,
        analysisType,
        trigger,
        insights: [],
        actions: [],
        modelUsed: null,
        modelTier: 0,
        costCents: 0,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // 3. Get previous insight titles (for deduplication)
  const { data: recentAnalyses } = await supabase
    .from("exo_knowledge_analyses")
    .select("insights")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(3);

  const previousTitles: string[] = [];
  if (recentAnalyses) {
    for (const a of recentAnalyses) {
      const insights = a.insights as Array<{ title: string }>;
      if (Array.isArray(insights)) {
        previousTitles.push(...insights.map((i) => i.title));
      }
    }
  }

  // 4. Analyze
  let insights;
  let modelUsed: string | null = null;
  let costCents = 0;
  let modelTier = 0;

  if (analysisType === "deep") {
    // AI-powered deep analysis
    const result = await synthesizeKnowledge(snapshot, previousTitles);
    insights = result.insights;
    modelUsed = result.modelUsed;
    costCents = result.costCents;
    modelTier = 2; // Haiku tier
  } else {
    // Rule-based light analysis
    insights = lightAnalysis(snapshot);
    modelUsed = null;
    modelTier = 0;
  }

  // 5. Route actions
  const actions =
    insights.length > 0 ? await routeKnowledgeActions(tenantId, insights) : [];

  const actionsProposed = actions.filter((a) => a.status === "proposed").length;
  const actionsExecuted = actions.filter((a) => a.status === "executed").length;
  const actionsBlocked = actions.filter((a) => a.status === "blocked").length;

  // 6. Store results
  const durationMs = Date.now() - startTime;

  await supabase
    .from("exo_knowledge_analyses")
    .insert({
      tenant_id: tenantId,
      analysis_type: analysisType,
      trigger,
      snapshot_hash: snapshotHash,
      insights: JSON.parse(JSON.stringify(insights)),
      actions_proposed: actionsProposed,
      actions_executed: actionsExecuted,
      actions_blocked: actionsBlocked,
      model_used: modelUsed,
      model_tier: modelTier,
      cost_cents: costCents,
      duration_ms: durationMs,
    })
    .then(({ error }) => {
      if (error) {
        logger.warn("[KAE] Failed to store analysis:", {
          tenantId,
          error: error.message,
        });
      }
    });

  // 7. Log to learning_events
  if (insights.length > 0) {
    await Promise.resolve(
      supabase.from("learning_events").insert({
        tenant_id: tenantId,
        event_type: "pattern_detected",
        data: {
          source: "kae",
          analysis_type: analysisType,
          insights_count: insights.length,
          insight_types: insights.map((i) => i.type),
          actions_taken: actions.length,
        },
        agent_id: "kae",
      }),
    ).catch(() => {
      // Non-critical
    });
  }

  // 8. Log to activity feed
  await Promise.resolve(
    supabase.from("exo_activity_log").insert({
      tenant_id: tenantId,
      action_type: "cron_action",
      action_name: `kae_${analysisType}`,
      description:
        insights.length > 0
          ? `KAE: ${insights.length} insightów, ${actionsExecuted} akcji`
          : `KAE: brak nowych insightów`,
      status: "success",
      source: trigger === "manual" ? "manual" : "loop-daily",
      metadata: {
        insights_count: insights.length,
        actions_proposed: actionsProposed,
        actions_executed: actionsExecuted,
        cost_cents: costCents,
        duration_ms: durationMs,
      },
    }),
  ).catch(() => {
    // Non-critical
  });

  logger.info("[KAE] Analysis complete:", {
    tenantId,
    analysisType,
    insights: insights.length,
    actionsExecuted,
    actionsProposed,
    costCents,
    durationMs,
  });

  return {
    tenantId,
    analysisType,
    trigger,
    insights,
    actions,
    modelUsed,
    modelTier,
    costCents,
    durationMs,
  };
}

/**
 * Run knowledge analysis for ALL tenants (used by loop-daily CRON).
 */
export async function runKnowledgeAnalysisForAllTenants(
  analysisType: AnalysisType = "deep",
  trigger: AnalysisTrigger = "loop_daily",
): Promise<{ processed: number; errors: number }> {
  const supabase = getServiceSupabase();

  // Get all tenants with loop config (active tenants)
  const { data: tenants, error } = await supabase
    .from("exo_tenant_loop_config")
    .select("tenant_id, daily_ai_budget_cents, daily_ai_spent_cents");

  if (error || !tenants) {
    logger.error("[KAE] Failed to fetch tenants:", { error: error?.message });
    return { processed: 0, errors: 1 };
  }

  let processed = 0;
  let errors = 0;

  for (const tenant of tenants) {
    // Budget check for deep analysis
    if (analysisType === "deep") {
      const budget = tenant.daily_ai_budget_cents ?? 50;
      const spent = tenant.daily_ai_spent_cents ?? 0;
      if (spent >= budget) {
        logger.info("[KAE] Skipping tenant (budget exhausted):", {
          tenantId: tenant.tenant_id,
          spent,
          budget,
        });
        continue;
      }
    }

    try {
      await runKnowledgeAnalysis(tenant.tenant_id, analysisType, trigger);
      processed++;
    } catch (error) {
      logger.error("[KAE] Tenant analysis failed:", {
        tenantId: tenant.tenant_id,
        error: (error as Error).message,
      });
      errors++;
    }
  }

  return { processed, errors };
}
