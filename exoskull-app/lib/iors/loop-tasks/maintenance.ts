/**
 * Maintenance Sub-Loop Handler (P5)
 *
 * ETL pipeline, garbage collection, health checks, self-healing.
 * Runs primarily from loop-daily during off-peak hours.
 */

import { completeWork, failWork } from "@/lib/iors/loop";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { PetlaWorkItem, SubLoopResult } from "@/lib/iors/loop-types";

import { logger } from "@/lib/logger";
export async function handleMaintenance(
  item: PetlaWorkItem,
): Promise<SubLoopResult> {
  const { tenant_id } = item;

  try {
    logger.info("[Petla:Maintenance] Processing:", {
      tenantId: tenant_id,
      handler: item.handler,
    });

    switch (item.handler) {
      case "run_maintenance": {
        const supabase = getServiceSupabase();
        const stats = { asyncTasks: 0, interventions: 0, predictions: 0 };

        // 1. Clean up completed/failed async tasks older than 7 days
        const taskCutoff = new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000,
        ).toISOString();
        const { data: cleanedTasks } = await supabase
          .from("exo_async_tasks")
          .delete()
          .in("status", ["completed", "failed"])
          .lt("created_at", taskCutoff)
          .select("id");
        stats.asyncTasks = cleanedTasks?.length || 0;

        // 2. Expire stale interventions (past expires_at, still proposed/approved)
        const { data: expiredInterventions } = await supabase
          .from("exo_interventions")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .lt("expires_at", new Date().toISOString())
          .in("status", ["proposed", "approved"])
          .select("id");
        stats.interventions = expiredInterventions?.length || 0;

        // 3. Clean up old delivered predictions (expired + delivered)
        const { data: expiredPredictions } = await supabase
          .from("exo_predictions")
          .delete()
          .lt("expires_at", new Date().toISOString())
          .not("delivered_at", "is", null)
          .select("id");
        stats.predictions = expiredPredictions?.length || 0;

        // 4. Clean up stale intervention queue items (>7 days old, max retries hit)
        await supabase
          .from("exo_intervention_queue")
          .delete()
          .lt(
            "last_attempt_at",
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          )
          .gte("attempts", 3);

        logger.info("[Petla:Maintenance] Cleanup stats:", {
          tenantId: tenant_id,
          ...stats,
        });
        break;
      }

      case "etl_bronze": {
        // Bronze is raw data on R2 — no transformation needed from Pętla.
        // Bronze writes happen at ingestion time in gateway + device sync.
        logger.info(
          "[Petla:Maintenance] Bronze ETL: no-op (writes at ingestion)",
          {
            tenantId: tenant_id,
          },
        );
        break;
      }

      case "etl_silver": {
        // Direct Silver ETL: raw Supabase tables → Silver (no R2 dependency)
        const { runDirectSilverETL } =
          await import("@/lib/datalake/silver-etl");
        const silverResult = await runDirectSilverETL();
        logger.info("[Petla:Maintenance] Silver ETL (direct) completed:", {
          tenantId: tenant_id,
          records: silverResult.totalRecords,
          errors: silverResult.totalErrors,
        });
        break;
      }

      case "etl_gold": {
        // Bridge to existing Gold ETL (refresh materialized views)
        const { runGoldETL } = await import("@/lib/datalake/gold-etl");
        const goldResult = await runGoldETL();
        logger.info("[Petla:Maintenance] Gold ETL completed:", {
          tenantId: tenant_id,
          views: goldResult.results.length,
          success: goldResult.results.filter((r) => r.success).length,
        });
        break;
      }

      case "highlight_decay": {
        // Reduce importance of stale memory highlights (>30 days untouched)
        const { runDecay } = await import("@/lib/learning/self-updater");
        const decayResult = await runDecay();
        logger.info("[Petla:Maintenance] Highlight decay completed:", {
          tenantId: tenant_id,
          decayed: decayResult.decayed,
        });
        break;
      }

      case "skill_lifecycle": {
        // Archive unused skills, expire old suggestions, revoke unhealthy ones
        const {
          archiveUnusedSkills,
          expireOldSuggestions,
          revokeUnhealthySkills,
        } = await import("@/lib/skills/registry/lifecycle-manager");

        const [archived, expired, revoked] = await Promise.all([
          archiveUnusedSkills(30),
          expireOldSuggestions(14),
          revokeUnhealthySkills(10, 0.3),
        ]);

        logger.info("[Petla:Maintenance] Skill lifecycle completed:", {
          tenantId: tenant_id,
          archived: archived.archivedCount,
          expired,
          revoked: revoked.revokedCount,
        });
        break;
      }

      case "knowledge_analysis": {
        // Deep AI-powered knowledge analysis (daily)
        const { runKnowledgeAnalysis } =
          await import("@/lib/iors/knowledge-engine");
        const kaeResult = await runKnowledgeAnalysis(
          tenant_id,
          "deep",
          "loop_daily",
        );
        logger.info("[Petla:Maintenance] Knowledge analysis completed:", {
          tenantId: tenant_id,
          insights: kaeResult.insights.length,
          actionsExecuted: kaeResult.actions.filter(
            (a) => a.status === "executed",
          ).length,
          costCents: kaeResult.costCents,
          durationMs: kaeResult.durationMs,
        });
        break;
      }

      default:
        logger.info("[Petla:Maintenance] Unknown handler:", item.handler);
    }

    if (item.id && item.status === "processing") {
      await completeWork(item.id, { maintained: true, handler: item.handler });
    }

    return { handled: true, cost_cents: 0 };
  } catch (error) {
    const err = error as Error;
    console.error("[Petla:Maintenance] Failed:", {
      tenantId: tenant_id,
      handler: item.handler,
      error: err.message,
      stack: err.stack,
    });

    if (item.id && item.status === "processing") {
      await failWork(item.id, err.message);
    }

    return { handled: false, error: err.message };
  }
}
