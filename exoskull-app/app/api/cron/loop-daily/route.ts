/**
 * Loop-Daily CRON — 24-Hour Deep Analysis
 *
 * Runs at 03:00 UTC. Handles:
 * 1. Budget reset (daily_ai_spent_cents = 0)
 * 2. Activity class reclassification
 * 3. Deep analysis for top active tenants (Sonnet Tier 3)
 * 4. Seed maintenance tasks (ETL, cleanup)
 * 5. Prune old events and work items (>7 days)
 */

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import {
  resetDailyBudgets,
  reclassifyTenants,
  pruneOldEvents,
  pruneOldWorkItems,
  backfillMissingConfigs,
  emitEvent,
} from "@/lib/iors/loop";
import { getServiceSupabase } from "@/lib/supabase/service";
import { dispatchToHandler } from "@/lib/iors/loop-tasks";
import { claimQueuedWork } from "@/lib/iors/loop";

import { analyzeHealthTrends } from "@/lib/iors/coaching/health-trends";
import { analyzeCrossDomain } from "@/lib/iors/coaching/cross-domain";
import { measureEffectiveness } from "@/lib/iors/coaching/effectiveness";
import { grantPermission } from "@/lib/iors/autonomy";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIMEOUT_MS = 50_000;

async function handler(req: NextRequest) {
  const startTime = Date.now();
  const workerId = `loop-daily-${Date.now()}`;

  try {
    // Step 1: Reset daily budgets
    const budgetResets = await resetDailyBudgets();
    logger.info("[LoopDaily] Budget resets:", budgetResets);

    // Step 2: Reclassify all tenants
    const reclassified = await reclassifyTenants();
    logger.info("[LoopDaily] Reclassified tenants:", reclassified);

    // Step 2.5: Backfill missing loop configs for tenants created outside gateway
    const backfilled = await backfillMissingConfigs();
    if (backfilled > 0) {
      logger.info("[LoopDaily] Backfilled missing loop configs:", backfilled);
    }

    // Step 2.7: Backfill missing autonomy permissions (message + call)
    let permissionsBackfilled = 0;
    try {
      const supabasePerms = getServiceSupabase();

      // Get all tenant IDs
      const { data: allTenants } = await supabasePerms
        .from("exo_tenants")
        .select("id");

      // Get tenant IDs that already have 'message' permission
      const { data: tenantsWithMessage } = await supabasePerms
        .from("exo_autonomy_permissions")
        .select("tenant_id")
        .eq("action_type", "message")
        .eq("granted", true)
        .is("revoked_at", null);

      const hasMessageSet = new Set(
        (tenantsWithMessage || []).map((r) => r.tenant_id),
      );

      const tenantsNeedingPerms = (allTenants || []).filter(
        (t) => !hasMessageSet.has(t.id),
      );

      for (const t of tenantsNeedingPerms) {
        await grantPermission(t.id, "message", "*", {
          requires_confirmation: false,
          granted_via: "birth",
        });
        await grantPermission(t.id, "call", "*", {
          requires_confirmation: false,
          granted_via: "birth",
        });
        permissionsBackfilled++;
      }

      if (permissionsBackfilled > 0) {
        logger.info(
          "[LoopDaily] Backfilled autonomy permissions:",
          permissionsBackfilled,
        );
      }
    } catch (permErr) {
      logger.warn("[LoopDaily] Permission backfill failed (non-blocking):", {
        error: permErr instanceof Error ? permErr.message : permErr,
      });
    }

    // Step 2.6: Run daily coaching analytics for active tenants
    const supabase = getServiceSupabase();
    let coachingAnalyzed = 0;
    if (Date.now() - startTime < TIMEOUT_MS - 30_000) {
      const { data: activeTenants } = await supabase
        .from("exo_tenant_loop_config")
        .select("tenant_id")
        .in("activity_class", ["active", "normal"])
        .limit(20);

      if (activeTenants && activeTenants.length > 0) {
        for (const t of activeTenants) {
          if (Date.now() - startTime > TIMEOUT_MS - 20_000) break;
          try {
            const [healthResult, crossResult, effectResult] =
              await Promise.allSettled([
                analyzeHealthTrends(t.tenant_id),
                analyzeCrossDomain(t.tenant_id),
                measureEffectiveness(t.tenant_id),
              ]);

            // Store insights for the coaching engine (emit events for significant findings)
            if (
              healthResult.status === "fulfilled" &&
              healthResult.value.alerts.length > 0
            ) {
              await emitEvent({
                tenantId: t.tenant_id,
                eventType: "coaching_trigger",
                priority: 2,
                source: "loop-daily/health-trends",
                payload: {
                  handler: "deliver_proactive",
                  alerts: healthResult.value.alerts,
                  summary: healthResult.value.summary,
                },
                dedupKey: `health-trends-${new Date().toISOString().slice(0, 10)}`,
              });
            }

            if (
              crossResult.status === "fulfilled" &&
              crossResult.value.topInsight
            ) {
              await emitEvent({
                tenantId: t.tenant_id,
                eventType: "coaching_trigger",
                priority: 3,
                source: "loop-daily/cross-domain",
                payload: {
                  handler: "deliver_proactive",
                  insight: crossResult.value.topInsight,
                },
                dedupKey: `cross-domain-${new Date().toISOString().slice(0, 10)}`,
              });
            }

            // Feed effectiveness recommendations into optimization
            if (
              effectResult.status === "fulfilled" &&
              effectResult.value.recommendations.length > 0
            ) {
              await emitEvent({
                tenantId: t.tenant_id,
                eventType: "optimization_signal",
                priority: 4,
                source: "loop-daily/effectiveness",
                payload: {
                  recommendations: effectResult.value.recommendations,
                  ackRate: effectResult.value.ackRate,
                  actionRate: effectResult.value.actionRate,
                  avgRating: effectResult.value.avgRating,
                },
                dedupKey: `effectiveness-${new Date().toISOString().slice(0, 10)}`,
              });
            }

            coachingAnalyzed++;
          } catch (err) {
            logger.warn("[LoopDaily] Coaching analytics failed for tenant:", {
              tenantId: t.tenant_id,
              error: err instanceof Error ? err.message : err,
            });
          }
        }
      }
    }
    logger.info("[LoopDaily] Coaching analytics:", { coachingAnalyzed });

    // Step 3: Seed maintenance tasks for off-peak execution

    // Emit maintenance events for ETL pipeline
    const maintenanceTasks = [
      { handler: "etl_bronze", priority: 5 },
      { handler: "etl_silver", priority: 5 },
      { handler: "etl_gold", priority: 5 },
      { handler: "highlight_decay", priority: 5 },
      { handler: "skill_lifecycle", priority: 5 },
      { handler: "knowledge_analysis", priority: 4 },
    ];

    let maintenanceSeeded = 0;
    // Use a system tenant ID for global maintenance tasks
    const { data: anyTenant } = await supabase
      .from("exo_tenants")
      .select("id")
      .limit(1)
      .single();

    if (anyTenant) {
      for (const task of maintenanceTasks) {
        await supabase.from("exo_petla_queue").insert({
          tenant_id: anyTenant.id,
          sub_loop: "maintenance",
          priority: task.priority,
          handler: task.handler,
          params: { triggered_by: "loop-daily" },
          status: "queued",
        });
        maintenanceSeeded++;
      }
    }

    // Step 4: Process ALL queued maintenance/optimization items (time permitting)
    let workProcessed = 0;
    while (Date.now() - startTime < TIMEOUT_MS - 15_000) {
      const workItem = await claimQueuedWork(workerId, [
        "optimization",
        "maintenance",
      ]);
      if (!workItem) break;
      await dispatchToHandler(workItem);
      workProcessed++;
    }

    // Step 5: Prune old events and work items
    const prunedEvents = await pruneOldEvents(7);
    const prunedWork = await pruneOldWorkItems(7);

    logger.info("[LoopDaily] Pruned:", {
      events: prunedEvents,
      workItems: prunedWork,
    });

    return NextResponse.json({
      ok: true,
      budgetResets,
      reclassified,
      coachingAnalyzed,
      maintenanceSeeded,
      workProcessed,
      prunedEvents,
      prunedWork,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("[LoopDaily] Error:", error);
    return NextResponse.json(
      {
        error: "Loop-daily processing failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "loop-daily" }, handler);
