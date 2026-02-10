/**
 * Data Pipeline Status API
 *
 * GET: Returns sync status from exo_bronze_sync_log + ETL timestamps per user
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parallel: bronze sync log + silver ETL status + gold ETL status
    const [syncResult, silverResult, goldResult] = await Promise.allSettled([
      supabase
        .from("exo_bronze_sync_log")
        .select("data_type, synced_at, record_count, status")
        .eq("tenant_id", user.id)
        .order("synced_at", { ascending: false })
        .limit(20),
      supabase
        .from("admin_cron_runs")
        .select("started_at, result")
        .eq("cron_name", "loop-daily")
        .order("started_at", { ascending: false })
        .limit(1),
      supabase
        .from("admin_cron_runs")
        .select("started_at, result")
        .eq("cron_name", "loop-daily")
        .order("started_at", { ascending: false })
        .limit(1),
    ]);

    const syncLogs =
      syncResult.status === "fulfilled" ? (syncResult.value.data ?? []) : [];
    const lastSilver =
      silverResult.status === "fulfilled"
        ? (silverResult.value.data?.[0] ?? null)
        : null;
    const lastGold =
      goldResult.status === "fulfilled"
        ? (goldResult.value.data?.[0] ?? null)
        : null;

    // Group sync logs by data_type (latest per type)
    const byType: Record<
      string,
      { last_sync: string; records: number; status: string }
    > = {};
    for (const log of syncLogs) {
      const dt = log.data_type as string;
      if (!byType[dt]) {
        byType[dt] = {
          last_sync: log.synced_at as string,
          records: (log.record_count as number) ?? 0,
          status: log.status as string,
        };
      }
    }

    // Freshness classification
    const now = Date.now();
    const classified = Object.entries(byType).map(([type, info]) => {
      const ageMs = now - new Date(info.last_sync).getTime();
      const ageHours = ageMs / (1000 * 60 * 60);
      let freshness: "fresh" | "stale" | "old" = "old";
      if (ageHours < 1) freshness = "fresh";
      else if (ageHours < 24) freshness = "stale";

      return {
        data_type: type,
        last_sync: info.last_sync,
        records: info.records,
        freshness,
      };
    });

    return NextResponse.json({
      syncStatus: classified,
      etl: {
        silver: lastSilver ? { lastRun: lastSilver.started_at } : null,
        gold: lastGold ? { lastRun: lastGold.started_at } : null,
      },
    });
  } catch (error) {
    console.error("[DataPipelineAPI] GET Error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
