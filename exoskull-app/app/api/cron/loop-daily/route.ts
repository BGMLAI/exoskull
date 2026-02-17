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

      if (tenantsNeedingPerms.length > 0) {
        // Batch insert permissions instead of individual grantPermission() calls
        const newPerms = tenantsNeedingPerms.flatMap((t) => [
          {
            tenant_id: t.id,
            action_type: "message",
            domain: "*",
            granted: true,
            requires_confirmation: false,
            granted_via: "birth",
          },
          {
            tenant_id: t.id,
            action_type: "call",
            domain: "*",
            granted: true,
            requires_confirmation: false,
            granted_via: "birth",
          },
        ]);
        await supabasePerms.from("exo_autonomy_permissions").insert(newPerms);
        permissionsBackfilled = tenantsNeedingPerms.length;
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
        .limit(10);

      if (activeTenants && activeTenants.length > 0) {
        // Process tenants in batches of 3 for parallelism
        const COACHING_BATCH = 3;
        for (let i = 0; i < activeTenants.length; i += COACHING_BATCH) {
          if (Date.now() - startTime > TIMEOUT_MS - 20_000) break;
          const tenantBatch = activeTenants.slice(i, i + COACHING_BATCH);

          const batchResults = await Promise.allSettled(
            tenantBatch.map(async (t) => {
              const [healthResult, crossResult, effectResult] =
                await Promise.allSettled([
                  analyzeHealthTrends(t.tenant_id),
                  analyzeCrossDomain(t.tenant_id),
                  measureEffectiveness(t.tenant_id),
                ]);

              const today = new Date().toISOString().slice(0, 10);
              const events: Promise<string | null>[] = [];

              if (
                healthResult.status === "fulfilled" &&
                healthResult.value.alerts.length > 0
              ) {
                events.push(
                  emitEvent({
                    tenantId: t.tenant_id,
                    eventType: "coaching_trigger",
                    priority: 2,
                    source: "loop-daily/health-trends",
                    payload: {
                      handler: "deliver_proactive",
                      alerts: healthResult.value.alerts,
                      summary: healthResult.value.summary,
                    },
                    dedupKey: `health-trends-${today}`,
                  }),
                );
              }

              if (
                crossResult.status === "fulfilled" &&
                crossResult.value.topInsight
              ) {
                events.push(
                  emitEvent({
                    tenantId: t.tenant_id,
                    eventType: "coaching_trigger",
                    priority: 3,
                    source: "loop-daily/cross-domain",
                    payload: {
                      handler: "deliver_proactive",
                      insight: crossResult.value.topInsight,
                    },
                    dedupKey: `cross-domain-${today}`,
                  }),
                );
              }

              if (
                effectResult.status === "fulfilled" &&
                effectResult.value.recommendations.length > 0
              ) {
                events.push(
                  emitEvent({
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
                    dedupKey: `effectiveness-${today}`,
                  }),
                );
              }

              await Promise.allSettled(events);
            }),
          );

          coachingAnalyzed += batchResults.filter(
            (r) => r.status === "fulfilled",
          ).length;
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
      const rows = maintenanceTasks.map((task) => ({
        tenant_id: anyTenant.id,
        sub_loop: "maintenance",
        priority: task.priority,
        handler: task.handler,
        params: { triggered_by: "loop-daily" },
        status: "queued",
      }));
      await supabase.from("exo_petla_queue").insert(rows);
      maintenanceSeeded = rows.length;
    }

    // Step 4: Process ALL queued maintenance/optimization items (time permitting)
    // Batch-parallel: claim up to BATCH_SIZE items, dispatch in parallel
    const BATCH_SIZE = 5;
    let workProcessed = 0;
    while (Date.now() - startTime < TIMEOUT_MS - 15_000) {
      const batch: Awaited<ReturnType<typeof claimQueuedWork>>[] = [];
      for (let i = 0; i < BATCH_SIZE; i++) {
        const item = await claimQueuedWork(workerId, [
          "optimization",
          "maintenance",
        ]);
        if (!item) break;
        batch.push(item);
      }
      if (batch.length === 0) break;

      await Promise.allSettled(batch.map((item) => dispatchToHandler(item!)));
      workProcessed += batch.length;
    }

    // Step 5: Prune old events and work items
    const prunedEvents = await pruneOldEvents(7);
    const prunedWork = await pruneOldWorkItems(7);

    // Step 5.5: Prune old process registry entries (>7 days)
    let prunedProcesses = 0;
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      await supabase
        .from("exo_process_registry")
        .delete()
        .in("status", ["completed", "failed", "expired"])
        .lt("completed_at", sevenDaysAgo);
      prunedProcesses = 1; // Pruned (exact count unavailable)
    } catch {
      // Table may not exist yet during migration rollout
    }

    logger.info("[LoopDaily] Pruned:", {
      events: prunedEvents,
      workItems: prunedWork,
      processes: prunedProcesses,
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
      prunedProcesses,
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
