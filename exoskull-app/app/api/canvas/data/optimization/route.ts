/**
 * Canvas Optimization Data API
 *
 * GET /api/canvas/data/optimization — Returns self-optimization stats.
 * Queries learning_events, exo_interventions, exo_feedback, exo_mapek_cycles.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@/lib/supabase/server";
import type { OptimizationStats } from "@/lib/dashboard/types";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      learningResult,
      successResult,
      failResult,
      blockedResult,
      feedbackResult,
      thisWeekResult,
      lastWeekResult,
      lastCycleResult,
    ] = await Promise.all([
      // Learning events (last 7 days)
      supabase
        .from("learning_events")
        .select("event_type")
        .eq("tenant_id", tenantId)
        .gte("created_at", weekAgo.toISOString()),

      // Successful interventions (last 30 days)
      supabase
        .from("exo_interventions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "completed")
        .gte("created_at", monthAgo.toISOString()),

      // Failed interventions (last 30 days)
      supabase
        .from("exo_interventions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", ["failed", "cancelled"])
        .gte("created_at", monthAgo.toISOString()),

      // Guardian-blocked interventions (last 30 days)
      supabase
        .from("exo_interventions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("guardian_verdict", "blocked")
        .gte("created_at", monthAgo.toISOString()),

      // Feedback ratings (last 30 days)
      supabase
        .from("exo_feedback")
        .select("rating")
        .eq("tenant_id", tenantId)
        .not("rating", "is", null)
        .gte("created_at", monthAgo.toISOString()),

      // This week completed interventions
      supabase
        .from("exo_interventions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "completed")
        .gte("created_at", weekAgo.toISOString()),

      // Last week completed interventions
      supabase
        .from("exo_interventions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "completed")
        .gte("created_at", twoWeeksAgo.toISOString())
        .lt("created_at", weekAgo.toISOString()),

      // Last MAPE-K cycle
      supabase
        .from("exo_mapek_cycles")
        .select("started_at, analyze_result, interventions_proposed")
        .eq("tenant_id", tenantId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // Count learning event types
    const events = learningResult.data || [];
    const highlightsExtracted = events.filter(
      (e) =>
        e.event_type === "highlight_added" ||
        e.event_type === "highlight_boosted",
    ).length;
    const patternsDetected = events.filter(
      (e) => e.event_type === "pattern_detected",
    ).length;

    // Count skills created this week
    const { count: skillsCreated } = await supabase
      .from("exo_generated_skills")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", weekAgo.toISOString());

    // Intervention success
    const successful = successResult.count || 0;
    const failed = failResult.count || 0;
    const guardianBlocked = blockedResult.count || 0;
    const total = successful + failed + guardianBlocked;
    const successRate = total > 0 ? successful / total : 0;

    // Feedback
    const ratings = (feedbackResult.data || []).map(
      (f: { rating: number }) => f.rating,
    );
    const avgRating =
      ratings.length > 0
        ? ratings.reduce((s: number, r: number) => s + r, 0) / ratings.length
        : 0;
    const positive = ratings.filter((r: number) => r >= 4).length;
    const negative = ratings.filter((r: number) => r <= 2).length;

    // Week over week
    const thisWeek = thisWeekResult.count || 0;
    const lastWeek = lastWeekResult.count || 0;
    const percentChange =
      lastWeek > 0
        ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
        : thisWeek > 0
          ? 100
          : 0;

    // Last cycle
    const cycle = lastCycleResult.data;
    const analyzeResult = cycle?.analyze_result as {
      issues?: unknown[];
    } | null;
    const issuesFound = analyzeResult?.issues?.length ?? 0;

    const stats: OptimizationStats = {
      learningProgress: {
        highlightsExtracted,
        patternsDetected,
        skillsCreated: skillsCreated || 0,
      },
      interventionSuccess: {
        successful,
        failed,
        guardianBlocked,
        total,
        successRate: Math.round(successRate * 100),
      },
      userSatisfaction: {
        avgRating: Math.round(avgRating * 10) / 10,
        positive,
        negative,
        totalRated: ratings.length,
      },
      weekOverWeek: {
        thisWeek,
        lastWeek,
        percentChange,
      },
      lastCycle: {
        ranAt: cycle?.started_at || null,
        issuesFound,
      },
    };

    return NextResponse.json({
      ...stats,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Canvas] Optimization data error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
