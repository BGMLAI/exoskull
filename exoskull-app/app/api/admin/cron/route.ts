import { NextResponse } from "next/server";
import { requireAdmin, getAdminSupabase } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

// Cron job definitions from vercel.json
const CRON_DEFINITIONS = [
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
  { name: "pulse", schedule: "*/30 * * * *", description: "Health check" },
  {
    name: "highlight-decay",
    schedule: "0 3 * * *",
    description: "Archive old highlights",
  },
  {
    name: "bronze-etl",
    schedule: "0 1 * * *",
    description: "Raw data ingestion",
  },
  {
    name: "silver-etl",
    schedule: "0 2 * * *",
    description: "Data cleaning & validation",
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
    name: "dunning",
    schedule: "0 */6 * * *",
    description: "Payment retry logic",
  },
  {
    name: "guardian-effectiveness",
    schedule: "0 6 * * *",
    description: "Guardian safety metrics",
  },
  {
    name: "guardian-values",
    schedule: "0 8 * * 0",
    description: "Value alignment (weekly)",
  },
  {
    name: "engagement-scoring",
    schedule: "0 7 * * *",
    description: "User engagement metrics",
  },
  {
    name: "drip-engine",
    schedule: "0 */6 * * *",
    description: "Proactive suggestion system",
  },
  {
    name: "admin-metrics",
    schedule: "30 5 * * *",
    description: "Admin daily snapshot",
  },
];

export async function GET() {
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
      (cronHealth || []).map((h: any) => [h.cron_name, h]),
    );

    const runsMap = new Map<string, any[]>();
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
      const health = healthMap.get(def.name) as any;
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
}
