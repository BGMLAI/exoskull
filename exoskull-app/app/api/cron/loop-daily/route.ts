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
  emitEvent,
} from "@/lib/iors/loop";
import { getServiceSupabase } from "@/lib/supabase/service";
import { dispatchToHandler } from "@/lib/iors/loop-tasks";
import { claimQueuedWork } from "@/lib/iors/loop";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIMEOUT_MS = 50_000;

async function handler(req: NextRequest) {
  const startTime = Date.now();
  const workerId = `loop-daily-${Date.now()}`;

  try {
    // Step 1: Reset daily budgets
    const budgetResets = await resetDailyBudgets();
    console.log("[LoopDaily] Budget resets:", budgetResets);

    // Step 2: Reclassify all tenants
    const reclassified = await reclassifyTenants();
    console.log("[LoopDaily] Reclassified tenants:", reclassified);

    // Step 3: Seed maintenance tasks for off-peak execution
    const supabase = getServiceSupabase();

    // Emit maintenance events for ETL pipeline
    const maintenanceTasks = [
      { handler: "etl_bronze", priority: 5 },
      { handler: "etl_silver", priority: 5 },
      { handler: "etl_gold", priority: 5 },
      { handler: "highlight_decay", priority: 5 },
      { handler: "skill_lifecycle", priority: 5 },
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

    // Step 4: Process one P4/P5 work item if time allows
    let workProcessed = 0;
    if (Date.now() - startTime < TIMEOUT_MS - 15_000) {
      const workItem = await claimQueuedWork(workerId, [
        "optimization",
        "maintenance",
      ]);
      if (workItem) {
        await dispatchToHandler(workItem);
        workProcessed = 1;
      }
    }

    // Step 5: Prune old events and work items
    const prunedEvents = await pruneOldEvents(7);
    const prunedWork = await pruneOldWorkItems(7);

    console.log("[LoopDaily] Pruned:", {
      events: prunedEvents,
      workItems: prunedWork,
    });

    return NextResponse.json({
      ok: true,
      budgetResets,
      reclassified,
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
