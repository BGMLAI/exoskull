/**
 * Monthly Summary CRON — Async Dispatcher
 *
 * Schedule: 1st of every month 09:00 UTC
 * Enqueues one async task per active tenant for monthly summary generation.
 * Actual processing happens in /api/cron/async-tasks (1 per minute, ~15s each).
 *
 * Previous approach processed all tenants inline (55s for 4 tenants, near 60s limit).
 * Async dispatch finishes in <2s regardless of tenant count.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { createTask } from "@/lib/async-tasks/queue";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Prefix used to identify monthly summary tasks in async-tasks processor.
 * Must match MONTHLY_SUMMARY_PREFIX in /api/cron/async-tasks/route.ts */
const MONTHLY_SUMMARY_PREFIX = "[SYSTEM:monthly_summary]";

async function handler(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  const supabase = getServiceSupabase();

  const { data: tenants, error: tenantsErr } = await supabase
    .from("exo_tenants")
    .select("id")
    .in("subscription_status", ["active", "trial"]);

  if (tenantsErr) {
    console.error("[MonthlySummary] Failed to fetch tenants:", {
      error: tenantsErr.message,
    });
    return NextResponse.json(
      { error: "Failed to fetch tenants", details: tenantsErr.message },
      { status: 500 },
    );
  }

  const activeTenants = tenants || [];

  if (activeTenants.length === 0) {
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      tenants_enqueued: 0,
      message: "No active tenants",
    });
  }

  // Enqueue one async task per tenant (lightweight — just DB inserts)
  const enqueued: string[] = [];
  const errors: string[] = [];

  for (const tenant of activeTenants) {
    try {
      const taskId = await createTask({
        tenantId: tenant.id,
        channel: "web_chat",
        channelMetadata: { source: "monthly_summary_cron" },
        replyTo: "system",
        prompt: MONTHLY_SUMMARY_PREFIX,
      });
      enqueued.push(taskId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${tenant.id}: ${msg}`);
      console.error("[MonthlySummary] Failed to enqueue tenant:", {
        tenantId: tenant.id,
        error: msg,
      });
    }
  }

  const durationMs = Date.now() - startTime;

  logger.info("[MonthlySummary] Dispatched:", {
    tenants: activeTenants.length,
    enqueued: enqueued.length,
    errors: errors.length,
    durationMs,
  });

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    duration_ms: durationMs,
    tenants_enqueued: enqueued.length,
    task_ids: enqueued,
    errors: errors.length > 0 ? errors : undefined,
  });
}

export const GET = withCronGuard({ name: "monthly-summary" }, handler);
