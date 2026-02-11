/**
 * Admin Daily Snapshot Calculator
 *
 * Runs daily at 05:30 UTC. Aggregates key metrics into admin_daily_snapshot
 * for fast dashboard loads without expensive real-time queries.
 */

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function postHandler(req: NextRequest) {
  const startTime = Date.now();

  const db = getServiceSupabase();
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString();

  logger.info(`[AdminMetrics] Calculating snapshot for ${today}`);

  // Users
  const { count: totalUsers } = await db
    .from("exo_tenants")
    .select("*", { count: "exact", head: true });

  const { count: newUsersToday } = await db
    .from("exo_tenants")
    .select("*", { count: "exact", head: true })
    .gte("created_at", `${today}T00:00:00Z`);

  const { data: activeUserData } = await db
    .from("exo_conversations")
    .select("tenant_id")
    .gte("created_at", yesterday);

  const uniqueActive24h = new Set(
    (activeUserData || []).map((r: { tenant_id: string }) => r.tenant_id),
  ).size;

  // Conversations & messages
  const { count: conversationsToday } = await db
    .from("exo_conversations")
    .select("*", { count: "exact", head: true })
    .gte("created_at", `${today}T00:00:00Z`);

  // AI usage
  const { data: aiData } = await db
    .from("exo_ai_usage")
    .select("estimated_cost")
    .gte("created_at", `${today}T00:00:00Z`);

  const aiTotalCost = (aiData || []).reduce(
    (sum, r: { estimated_cost: number }) => sum + (r.estimated_cost || 0),
    0,
  );
  const aiTotalRequests = aiData?.length || 0;

  // Cron stats
  const { count: cronRun } = await db
    .from("admin_cron_runs")
    .select("*", { count: "exact", head: true })
    .gte("started_at", `${today}T00:00:00Z`);

  const { count: cronFailed } = await db
    .from("admin_cron_runs")
    .select("*", { count: "exact", head: true })
    .gte("started_at", `${today}T00:00:00Z`)
    .eq("status", "failed");

  // Interventions
  const { count: interventionsProposed } = await db
    .from("exo_interventions")
    .select("*", { count: "exact", head: true })
    .gte("created_at", `${today}T00:00:00Z`);

  const { count: interventionsExecuted } = await db
    .from("exo_interventions")
    .select("*", { count: "exact", head: true })
    .gte("created_at", `${today}T00:00:00Z`)
    .eq("guardian_verdict", "approved");

  const { count: guardianBlocks } = await db
    .from("exo_interventions")
    .select("*", { count: "exact", head: true })
    .gte("created_at", `${today}T00:00:00Z`)
    .eq("guardian_verdict", "blocked");

  // Upsert snapshot
  const snapshot = {
    date: today,
    total_users: totalUsers || 0,
    new_users_today: newUsersToday || 0,
    active_users_24h: uniqueActive24h,
    total_conversations_today: conversationsToday || 0,
    ai_total_cost_today: aiTotalCost,
    ai_total_requests_today: aiTotalRequests,
    cron_jobs_run: cronRun || 0,
    cron_jobs_failed: cronFailed || 0,
    interventions_proposed: interventionsProposed || 0,
    interventions_executed: interventionsExecuted || 0,
    guardian_blocks: guardianBlocks || 0,
    calculated_at: new Date().toISOString(),
  };

  await db
    .from("admin_daily_snapshot")
    .upsert(snapshot, { onConflict: "date" });

  // Cleanup old logs
  try {
    await db.rpc("cleanup_admin_logs");
  } catch {
    /* ignore cleanup errors */
  }

  const duration = Date.now() - startTime;
  logger.info(`[AdminMetrics] Snapshot calculated in ${duration}ms`);

  return NextResponse.json({
    snapshot,
    duration_ms: duration,
  });
}

export const GET = withCronGuard({ name: "admin-metrics" }, postHandler);
export const POST = withCronGuard({ name: "admin-metrics" }, postHandler);
