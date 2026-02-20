/**
 * Process Conductor — Work Catalog
 *
 * Defines ALL types of autonomous background work the system can perform.
 * Each entry has: eligibility check, execution function, cost estimate,
 * priority category, and cooldown rules.
 *
 * The conductor picks the highest-priority eligible work when process count
 * drops below MIN_CONCURRENT.
 */

export type WorkCategory =
  | "user_facing" // 100: Directly benefits user NOW
  | "intelligence" // 80:  Analysis, insights, patterns
  | "system_maintenance" // 50:  ETL, cleanup, health
  | "optimization" // 30:  Performance, quality
  | "speculative"; // 10:  Exploratory

export type CostTier = "free" | "cheap" | "moderate" | "expensive";

export interface WorkContext {
  workerId: string;
  processId: string;
  tenantId?: string;
  budgetRemainingCents: number;
  timeRemainingMs: number;
  startTime: number;
}

export interface WorkResult {
  success: boolean;
  costCents: number;
  result?: Record<string, unknown>;
  error?: string;
}

export interface WorkCatalogEntry {
  id: string;
  name: string;
  category: WorkCategory;
  costTier: CostTier;
  estimatedCostCents: number;
  maxDurationMs: number;
  cooldownMinutes: number;
  perTenant: boolean;
  isEligible: (ctx: WorkContext) => Promise<boolean>;
  execute: (ctx: WorkContext) => Promise<WorkResult>;
}

// ============================================================================
// COST WEIGHTS (prefer free work over expensive)
// ============================================================================

const COST_WEIGHT: Record<CostTier, number> = {
  free: 4,
  cheap: 3,
  moderate: 2,
  expensive: 1,
};

// ============================================================================
// CATALOG ENTRIES
// ============================================================================

export const WORK_CATALOG: WorkCatalogEntry[] = [
  // ── USER FACING (Priority 100) ─────────────────────────────────

  {
    id: "proactive_message_check",
    name: "Proactive Message Check",
    category: "user_facing",
    costTier: "free",
    estimatedCostCents: 0,
    maxDurationMs: 15_000,
    cooldownMinutes: 5,
    perTenant: true,
    isEligible: async (ctx) => {
      const { quickStateCheck } = await import("@/lib/iors/loop");
      const state = await quickStateCheck(ctx.tenantId!);
      return (
        state.pendingInterventions > 0 ||
        state.overdueTasks > 0 ||
        state.undeliveredInsights > 0
      );
    },
    execute: async (ctx) => {
      const { runProactiveCheck } =
        await import("@/lib/conductor/workers/proactive-worker");
      return runProactiveCheck(ctx);
    },
  },

  {
    id: "pending_async_task",
    name: "Process Async Task",
    category: "user_facing",
    costTier: "moderate",
    estimatedCostCents: 3,
    maxDurationMs: 50_000,
    cooldownMinutes: 0,
    perTenant: false,
    isEligible: async () => {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const { count } = await getServiceSupabase()
        .from("exo_async_tasks")
        .select("*", { count: "exact", head: true })
        .in("status", ["queued", "failed"]);
      return (count || 0) > 0;
    },
    execute: async (ctx) => {
      const { processOneAsyncTask } =
        await import("@/lib/conductor/workers/async-task-worker");
      return processOneAsyncTask(ctx);
    },
  },

  // ── INTELLIGENCE (Priority 80) ─────────────────────────────────

  {
    id: "deep_knowledge_analysis",
    name: "Deep Knowledge Analysis",
    category: "intelligence",
    costTier: "moderate",
    estimatedCostCents: 3,
    maxDurationMs: 45_000,
    cooldownMinutes: 120,
    perTenant: true,
    isEligible: async (ctx) => {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const { count } = await getServiceSupabase()
        .from("exo_document_chunks")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenantId!);
      return (count || 0) >= 5;
    },
    execute: async (ctx) => {
      try {
        const { runKnowledgeAnalysis } =
          await import("@/lib/iors/knowledge-engine");
        await runKnowledgeAnalysis(ctx.tenantId!, "deep", "event");
        return { success: true, costCents: 3 };
      } catch (err) {
        return {
          success: false,
          costCents: 1,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  },

  {
    id: "cross_domain_insights",
    name: "Cross-Domain Pattern Detection",
    category: "intelligence",
    costTier: "cheap",
    estimatedCostCents: 1,
    maxDurationMs: 30_000,
    cooldownMinutes: 360,
    perTenant: true,
    isEligible: async (ctx) => {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const { count } = await getServiceSupabase()
        .from("exo_daily_summaries")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenantId!)
        .gte(
          "created_at",
          new Date(Date.now() - 14 * 86_400_000).toISOString(),
        );
      return (count || 0) >= 7;
    },
    execute: async (ctx) => {
      try {
        const { analyzeCrossDomain } =
          await import("@/lib/iors/coaching/cross-domain");
        const result = await analyzeCrossDomain(ctx.tenantId!);
        return {
          success: true,
          costCents: 1,
          result: { topInsight: result.topInsight },
        };
      } catch (err) {
        return {
          success: false,
          costCents: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  },

  {
    id: "trend_detection",
    name: "Behavioral Trend Detection",
    category: "intelligence",
    costTier: "cheap",
    estimatedCostCents: 1,
    maxDurationMs: 25_000,
    cooldownMinutes: 360,
    perTenant: true,
    isEligible: async (ctx) => {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const { count } = await getServiceSupabase()
        .from("exo_daily_summaries")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenantId!)
        .gte(
          "created_at",
          new Date(Date.now() - 30 * 86_400_000).toISOString(),
        );
      return (count || 0) >= 14;
    },
    execute: async (ctx) => {
      try {
        const { analyzeHealthTrends } =
          await import("@/lib/iors/coaching/health-trends");
        const result = await analyzeHealthTrends(ctx.tenantId!);
        return {
          success: true,
          costCents: 1,
          result: { alerts: result.alerts.length },
        };
      } catch (err) {
        return {
          success: false,
          costCents: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  },

  {
    id: "goal_strategy_refinement",
    name: "Goal Strategy Refinement",
    category: "intelligence",
    costTier: "cheap",
    estimatedCostCents: 1,
    maxDurationMs: 25_000,
    cooldownMinutes: 720,
    perTenant: true,
    isEligible: async (ctx) => {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const { count } = await getServiceSupabase()
        .from("user_quests")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenantId!)
        .in("status", ["active", "pending"]);
      return (count || 0) > 0;
    },
    execute: async (ctx) => {
      try {
        const { measureEffectiveness } =
          await import("@/lib/iors/coaching/effectiveness");
        const result = await measureEffectiveness(ctx.tenantId!);
        return {
          success: true,
          costCents: 1,
          result: { recommendations: result.recommendations.length },
        };
      } catch (err) {
        return {
          success: false,
          costCents: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  },

  {
    id: "email_deep_analysis",
    name: "Email Deep Analysis",
    category: "intelligence",
    costTier: "cheap",
    estimatedCostCents: 1,
    maxDurationMs: 40_000,
    cooldownMinutes: 180,
    perTenant: true,
    isEligible: async (ctx) => {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const { count } = await getServiceSupabase()
        .from("exo_analyzed_emails")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenantId!)
        .gte("created_at", new Date(Date.now() - 48 * 3_600_000).toISOString());
      return (count || 0) >= 3;
    },
    execute: async (ctx) => {
      const { runEmailDeepAnalysis } =
        await import("@/lib/conductor/workers/email-deep-worker");
      return runEmailDeepAnalysis(ctx);
    },
  },

  {
    id: "context_enrichment",
    name: "Context Enrichment",
    category: "intelligence",
    costTier: "cheap",
    estimatedCostCents: 1,
    maxDurationMs: 30_000,
    cooldownMinutes: 360,
    perTenant: true,
    isEligible: async (ctx) => {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const { count } = await getServiceSupabase()
        .from("exo_unified_messages")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenantId!)
        .eq("direction", "inbound")
        .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString());
      return (count || 0) >= 5;
    },
    execute: async (ctx) => {
      const { runContextEnrichment } =
        await import("@/lib/conductor/workers/context-enrichment-worker");
      return runContextEnrichment(ctx);
    },
  },

  {
    id: "memory_consolidation",
    name: "Memory Consolidation",
    category: "intelligence",
    costTier: "free",
    estimatedCostCents: 0,
    maxDurationMs: 25_000,
    cooldownMinutes: 360,
    perTenant: true,
    isEligible: async (ctx) => {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const { count } = await getServiceSupabase()
        .from("exo_memory_highlights")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenantId!)
        .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString());
      return (count || 0) >= 3;
    },
    execute: async (ctx) => {
      const { runMemoryConsolidation } =
        await import("@/lib/conductor/workers/memory-consolidation-worker");
      return runMemoryConsolidation(ctx);
    },
  },

  // ── SYSTEM MAINTENANCE (Priority 50) ───────────────────────────

  {
    id: "etl_catchup",
    name: "ETL Catch-Up",
    category: "system_maintenance",
    costTier: "free",
    estimatedCostCents: 0,
    maxDurationMs: 45_000,
    cooldownMinutes: 120,
    perTenant: false,
    isEligible: async () => {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const fourHoursAgo = new Date(Date.now() - 4 * 3_600_000).toISOString();
      const { data } = await getServiceSupabase()
        .from("admin_cron_runs")
        .select("completed_at")
        .in("cron_name", ["silver-etl", "gold-etl"])
        .eq("status", "completed")
        .gte("completed_at", fourHoursAgo)
        .limit(1);
      return !data || data.length === 0;
    },
    execute: async () => {
      try {
        const { runDirectSilverETL } =
          await import("@/lib/datalake/silver-etl");
        const result = await runDirectSilverETL();
        return {
          success: true,
          costCents: 0,
          result: { records: result.totalRecords, errors: result.totalErrors },
        };
      } catch (err) {
        return {
          success: false,
          costCents: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  },

  {
    id: "data_quality_audit",
    name: "Data Quality Audit",
    category: "system_maintenance",
    costTier: "free",
    estimatedCostCents: 0,
    maxDurationMs: 30_000,
    cooldownMinutes: 720,
    perTenant: false,
    isEligible: async () => true,
    execute: async (ctx) => {
      const { runDataQualityAudit } =
        await import("@/lib/conductor/workers/data-quality-worker");
      return runDataQualityAudit(ctx);
    },
  },

  {
    id: "petla_queue_drain",
    name: "Petla Queue Drain",
    category: "system_maintenance",
    costTier: "free",
    estimatedCostCents: 0,
    maxDurationMs: 40_000,
    cooldownMinutes: 5,
    perTenant: false,
    isEligible: async () => {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const { count } = await getServiceSupabase()
        .from("exo_petla_queue")
        .select("*", { count: "exact", head: true })
        .eq("status", "queued");
      return (count || 0) > 0;
    },
    execute: async (ctx) => {
      try {
        const { claimQueuedWork } = await import("@/lib/iors/loop");
        const { dispatchToHandler } = await import("@/lib/iors/loop-tasks");
        const workItem = await claimQueuedWork(ctx.workerId, [
          "proactive",
          "observation",
          "optimization",
          "maintenance",
        ]);
        if (!workItem)
          return { success: true, costCents: 0, result: { drained: 0 } };
        await dispatchToHandler(workItem);
        return {
          success: true,
          costCents: 0,
          result: { drained: 1, handler: workItem.handler },
        };
      } catch (err) {
        return {
          success: false,
          costCents: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  },

  // ── OPTIMIZATION (Priority 30) ─────────────────────────────────

  {
    id: "app_optimization",
    name: "App Optimization",
    category: "optimization",
    costTier: "cheap",
    estimatedCostCents: 1,
    maxDurationMs: 30_000,
    cooldownMinutes: 720,
    perTenant: true,
    isEligible: async (ctx) => {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const { count } = await getServiceSupabase()
        .from("exo_generated_apps")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenantId!)
        .eq("status", "active");
      return (count || 0) > 0;
    },
    execute: async (ctx) => {
      const { runAppOptimization } =
        await import("@/lib/conductor/workers/app-optimization-worker");
      return runAppOptimization(ctx);
    },
  },

  {
    id: "skill_recommendations",
    name: "Skill Recommendations",
    category: "optimization",
    costTier: "cheap",
    estimatedCostCents: 1,
    maxDurationMs: 25_000,
    cooldownMinutes: 1440,
    perTenant: true,
    isEligible: async (ctx) => {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const { count } = await getServiceSupabase()
        .from("exo_unified_messages")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenantId!)
        .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
      return (count || 0) >= 10;
    },
    execute: async (ctx) => {
      try {
        const { suggestSelfBuildActions } =
          await import("@/lib/system/self-builder");
        const suggestions = await suggestSelfBuildActions(ctx.tenantId!);
        return {
          success: true,
          costCents: 1,
          result: {
            suggestions: Array.isArray(suggestions) ? suggestions.length : 0,
          },
        };
      } catch (err) {
        return {
          success: false,
          costCents: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  },

  // ── OPTIMIZATION: Outcome Analysis ──────────────────────────────
  {
    id: "outcome_analysis",
    name: "Intervention Outcome Analysis",
    category: "optimization",
    costTier: "free",
    estimatedCostCents: 0,
    maxDurationMs: 15_000,
    cooldownMinutes: 360, // Once every 6h
    perTenant: true,
    isEligible: async (ctx) => {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const { count } = await getServiceSupabase()
        .from("exo_interventions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenantId!)
        .eq("status", "completed")
        .gte("executed_at", new Date(Date.now() - 48 * 3600000).toISOString());
      return (count || 0) > 0;
    },
    execute: async (ctx) => {
      try {
        const { analyzeRecentOutcomes } =
          await import("@/lib/autonomy/outcome-tracker");
        const result = await analyzeRecentOutcomes(ctx.tenantId!);
        return {
          success: true,
          costCents: 0,
          result: {
            processed: result.processed,
            outcomes: result.outcomes.length,
          },
        };
      } catch (err) {
        return {
          success: false,
          costCents: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  },

  // ── SPECULATIVE (Priority 10) ──────────────────────────────────

  {
    id: "ralph_micro_cycle",
    name: "Ralph Micro-Cycle",
    category: "speculative",
    costTier: "cheap",
    estimatedCostCents: 1,
    maxDurationMs: 45_000,
    cooldownMinutes: 30,
    perTenant: true,
    isEligible: async (ctx) => {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const { data } = await getServiceSupabase()
        .from("exo_tenant_loop_config")
        .select("activity_class")
        .eq("tenant_id", ctx.tenantId!)
        .maybeSingle();
      return (
        data?.activity_class === "active" || data?.activity_class === "normal"
      );
    },
    execute: async (ctx) => {
      try {
        const { runRalphCycle } = await import("@/lib/iors/ralph-loop");
        const timeBudget = Math.min(ctx.timeRemainingMs - 5_000, 35_000);
        const result = await runRalphCycle(ctx.tenantId!, timeBudget);
        return {
          success: result.outcome !== "failed",
          costCents: 1,
          result: { outcome: result.outcome, action: result.action?.type },
        };
      } catch (err) {
        return {
          success: false,
          costCents: 1,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  },
];

// ============================================================================
// HELPERS
// ============================================================================

export function getWorkEntry(id: string): WorkCatalogEntry | undefined {
  return WORK_CATALOG.find((w) => w.id === id);
}

export function sortByPriority(
  entries: WorkCatalogEntry[],
  categoryWeights: Record<WorkCategory, number>,
): WorkCatalogEntry[] {
  return [...entries].sort((a, b) => {
    const scoreA = (categoryWeights[a.category] || 0) * COST_WEIGHT[a.costTier];
    const scoreB = (categoryWeights[b.category] || 0) * COST_WEIGHT[b.costTier];
    return scoreB - scoreA;
  });
}
