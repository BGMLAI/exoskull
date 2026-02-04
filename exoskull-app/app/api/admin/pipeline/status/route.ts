import { NextResponse } from "next/server";
import { requireAdmin, getAdminSupabase } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const db = getAdminSupabase();

    // Gold sync log (ETL runs)
    const { data: goldSyncLog } = await db
      .from("exo_gold_sync_log")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(30);

    // Rig sync log (integration syncs)
    const { data: rigSyncLog } = await db
      .from("exo_rig_sync_log")
      .select("*, connection:exo_rig_connections(rig_slug)")
      .order("started_at", { ascending: false })
      .limit(30);

    // Pipeline stages status (last run of each ETL type)
    const etlStages = ["bronze-etl", "silver-etl", "gold-etl"];
    const { data: etlRuns } = await db
      .from("admin_cron_runs")
      .select(
        "cron_name, status, started_at, completed_at, duration_ms, error_message",
      )
      .in("cron_name", etlStages)
      .order("started_at", { ascending: false })
      .limit(30);

    // Group by stage, get latest
    const stageStatus = new Map<string, any>();
    for (const run of etlRuns || []) {
      if (!stageStatus.has(run.cron_name)) {
        stageStatus.set(run.cron_name, run);
      }
    }

    // Gold view row counts
    const goldViews = [
      "exo_gold_daily_summary",
      "exo_gold_weekly_summary",
      "exo_gold_monthly_summary",
      "exo_gold_messages_daily",
    ];

    const viewCounts: Record<string, number> = {};
    for (const view of goldViews) {
      const { count } = await db
        .from(view)
        .select("*", { count: "exact", head: true });
      viewCounts[view] = count || 0;
    }

    return NextResponse.json({
      stages: {
        bronze: stageStatus.get("bronze-etl") || null,
        silver: stageStatus.get("silver-etl") || null,
        gold: stageStatus.get("gold-etl") || null,
      },
      goldSyncLog: goldSyncLog || [],
      rigSyncLog: rigSyncLog || [],
      goldViewCounts: viewCounts,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[AdminPipeline] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
