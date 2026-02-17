import { NextResponse } from "next/server";
import { requireAdmin, getAdminSupabase } from "@/lib/admin/auth";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// Complete CRON definitions (all 26 jobs)
const CRON_DEFINITIONS = [
  // High-frequency
  {
    name: "async-tasks",
    schedule: "* * * * *",
    description: "Async task queue processor (every 1min)",
  },
  {
    name: "master-scheduler",
    schedule: "0 * * * *",
    description: "Central job coordinator (hourly)",
  },
  {
    name: "intervention-executor",
    schedule: "*/15 * * * *",
    description: "Execute autonomy actions",
  },
  {
    name: "post-conversation",
    schedule: "*/15 * * * *",
    description: "Post-conversation processing",
  },
  // ETL pipeline
  {
    name: "bronze-etl",
    schedule: "0 1 * * *",
    description: "Raw data ingestion (R2 Parquet)",
  },
  {
    name: "silver-etl",
    schedule: "0 2 * * *",
    description: "Data cleaning & validation",
  },
  {
    name: "highlight-decay",
    schedule: "0 3 * * *",
    description: "Archive old highlights",
  },
  {
    name: "gold-etl",
    schedule: "0 4 * * *",
    description: "Aggregate materialized views",
  },
  {
    name: "business-metrics",
    schedule: "0 5 * * *",
    description: "Calculate business KPIs",
  },
  {
    name: "admin-metrics",
    schedule: "30 5 * * *",
    description: "Admin daily snapshot",
  },
  // Daily analytics
  {
    name: "guardian-effectiveness",
    schedule: "0 6 * * *",
    description: "Guardian safety metrics",
  },
  {
    name: "predictions",
    schedule: "0 6 * * *",
    description: "Health predictions (illness, burnout)",
  },
  {
    name: "engagement-scoring",
    schedule: "0 7 * * *",
    description: "User engagement metrics",
  },
  {
    name: "insight-push",
    schedule: "0 10 * * *",
    description: "Cross-domain insight delivery",
  },
  {
    name: "daily-summary",
    schedule: "0 19 * * *",
    description: "User daily recap",
  },
  {
    name: "goal-progress",
    schedule: "0 20 * * *",
    description: "Goal progress report",
  },
  {
    name: "skill-lifecycle",
    schedule: "0 3 * * *",
    description: "Archive unused skills",
  },
  // Periodic
  {
    name: "dunning",
    schedule: "0 */6 * * *",
    description: "Payment retry logic",
  },
  {
    name: "drip-engine",
    schedule: "0 */6 * * *",
    description: "Spaced repetition content delivery",
  },
  {
    name: "self-optimization",
    schedule: "0 */6 * * *",
    description: "System self-improvement",
  },
  {
    name: "outbound-monitor",
    schedule: "0 */2 * * *",
    description: "Outbound delivery monitoring",
  },
  {
    name: "voice-transcription",
    schedule: "0 */4 * * *",
    description: "Voice recording transcription",
  },
  // Weekly
  {
    name: "weekly-summary",
    schedule: "0 18 * * 0",
    description: "User weekly recap (Sunday)",
  },
  {
    name: "guardian-values",
    schedule: "0 8 * * 0",
    description: "Value alignment (Sunday)",
  },
  {
    name: "gap-detection",
    schedule: "0 9 * * 0",
    description: "Blind spot detection (Sunday)",
  },
  // Monthly
  {
    name: "monthly-summary",
    schedule: "0 9 1 * *",
    description: "User monthly recap",
  },
];

export const GET = withApiLog(async function GET() {
  try {
    await requireAdmin();
    const db = getAdminSupabase();

    // Get health summary
    const { data: cronHealth } = await db.rpc("get_cron_health_summary", {
      p_hours: 48,
    });

    // Get last 10 runs for each cron
    const { data: recentRuns } = await db
      .from("admin_cron_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(150);

    // Merge definitions with health data
    const healthMap = new Map(
      (cronHealth || []).map((h: { cron_name: string }) => [h.cron_name, h]),
    );

    const runsMap = new Map<string, Record<string, unknown>[]>();
    for (const run of recentRuns || []) {
      if (!runsMap.has(run.cron_name)) {
        runsMap.set(run.cron_name, []);
      }
      const runs = runsMap.get(run.cron_name)!;
      if (runs.length < 10) {
        runs.push(run);
      }
    }

    const crons = CRON_DEFINITIONS.map((def) => {
      const health = healthMap.get(def.name) as
        | Record<string, unknown>
        | undefined;
      return {
        ...def,
        total_runs: health?.total_runs || 0,
        successful_runs: health?.successful_runs || 0,
        failed_runs: health?.failed_runs || 0,
        avg_duration_ms: health?.avg_duration_ms || null,
        last_run_at: health?.last_run_at || null,
        last_status: health?.last_status || "unknown",
        recent_runs: runsMap.get(def.name) || [],
      };
    });

    return NextResponse.json({ crons });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[AdminCron] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
