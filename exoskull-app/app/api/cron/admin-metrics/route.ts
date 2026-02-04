/**
 * Admin Daily Snapshot Calculator
 *
 * Runs daily at 05:30 UTC. Aggregates key metrics into admin_daily_snapshot
 * for fast dashboard loads without expensive real-time queries.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function verifyCronAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET || "exoskull-cron-2026";
  const headerSecret = req.headers.get("x-cron-secret");
  if (headerSecret === cronSecret) return true;
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;
  return false;
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    if (!verifyCronAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getSupabase();
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString();

    console.log(`[AdminMetrics] Calculating snapshot for ${today}`);

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
      (activeUserData || []).map((r: any) => r.tenant_id),
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
      (sum, r: any) => sum + (r.estimated_cost || 0),
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
    console.log(`[AdminMetrics] Snapshot calculated in ${duration}ms`);

    return NextResponse.json({
      snapshot,
      duration_ms: duration,
    });
  } catch (error) {
    console.error("[AdminMetrics] Fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
