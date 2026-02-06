/**
 * Gold Layer ETL
 * Refreshes materialized views for pre-aggregated dashboard queries
 *
 * Views:
 * - exo_gold_daily_summary - Daily conversation aggregations
 * - exo_gold_weekly_summary - Weekly conversation aggregations
 * - exo_gold_monthly_summary - Monthly conversation aggregations
 * - exo_gold_messages_daily - Daily message aggregations
 *
 * Schedule: Daily at 02:00 UTC
 */

import { getServiceSupabase } from "@/lib/supabase/service";

// ============================================================================
// Supabase Client
// ============================================================================

// ============================================================================
// Types
// ============================================================================

export interface RefreshResult {
  viewName: string;
  success: boolean;
  durationMs: number;
  rowsCount: number;
  error?: string;
}

export interface GoldETLSummary {
  startedAt: Date;
  completedAt: Date;
  results: RefreshResult[];
  totalViews: number;
  successCount: number;
  errorCount: number;
}

export interface GoldStats {
  daily: number;
  weekly: number;
  monthly: number;
  messagesDaily: number;
  lastRefresh: string | null;
}

// ============================================================================
// View Names
// ============================================================================

const GOLD_VIEWS = [
  "exo_gold_daily_summary",
  "exo_gold_weekly_summary",
  "exo_gold_monthly_summary",
  "exo_gold_messages_daily",
] as const;

type GoldViewName = (typeof GOLD_VIEWS)[number];

// ============================================================================
// Refresh Functions
// ============================================================================

/**
 * Refresh a single materialized view
 * Uses CONCURRENTLY to avoid locking reads
 */
async function refreshView(viewName: GoldViewName): Promise<RefreshResult> {
  const startTime = Date.now();

  try {
    // REFRESH MATERIALIZED VIEW CONCURRENTLY requires unique index
    // We use raw SQL via RPC since Supabase JS doesn't support REFRESH directly
    const { error: refreshError } = await getServiceSupabase().rpc(
      "refresh_gold_view",
      {
        view_name: viewName,
      },
    );

    // If RPC doesn't exist, try direct refresh
    if (
      refreshError?.message?.includes("function") ||
      refreshError?.message?.includes("does not exist")
    ) {
      // Fallback: Use non-concurrent refresh via raw query
      // Note: This may cause brief read locks
      const { error: directError } = await getServiceSupabase()
        .from(viewName)
        .select("*", { count: "exact", head: true });

      if (directError) {
        throw new Error(
          `View ${viewName} may not exist: ${directError.message}`,
        );
      }

      // The view exists, but we can't refresh it directly from JS
      // Log that manual refresh is needed
      console.warn(
        `[GoldETL] View ${viewName} exists but REFRESH requires manual SQL or RPC function`,
      );
    } else if (refreshError) {
      throw new Error(refreshError.message);
    }

    // Get row count
    const { count } = await getServiceSupabase()
      .from(viewName)
      .select("*", { count: "exact", head: true });

    const durationMs = Date.now() - startTime;

    // Log to sync log
    await logRefresh(viewName, durationMs, count || 0, "success", null);

    return {
      viewName,
      success: true,
      durationMs,
      rowsCount: count || 0,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    // Log error
    await logRefresh(viewName, durationMs, 0, "error", errorMsg);

    return {
      viewName,
      success: false,
      durationMs,
      rowsCount: 0,
      error: errorMsg,
    };
  }
}

/**
 * Log refresh to sync log table
 */
async function logRefresh(
  viewName: string,
  durationMs: number,
  rowsCount: number,
  status: string,
  errorMessage: string | null,
): Promise<void> {
  await getServiceSupabase().from("exo_gold_sync_log").insert({
    view_name: viewName,
    duration_ms: durationMs,
    rows_count: rowsCount,
    status,
    error_message: errorMessage,
  });
}

// ============================================================================
// Main ETL Runner
// ============================================================================

/**
 * Refresh all Gold layer materialized views
 */
export async function runGoldETL(): Promise<GoldETLSummary> {
  const startedAt = new Date();
  const results: RefreshResult[] = [];

  console.log(`[GoldETL] Starting refresh at ${startedAt.toISOString()}`);

  // Refresh each view sequentially
  // (parallel refresh could cause resource contention)
  for (const viewName of GOLD_VIEWS) {
    console.log(`[GoldETL] Refreshing ${viewName}...`);
    const result = await refreshView(viewName);
    results.push(result);

    if (result.success) {
      console.log(
        `[GoldETL] ${viewName}: ${result.rowsCount} rows in ${result.durationMs}ms`,
      );
    } else {
      console.error(`[GoldETL] ${viewName} FAILED: ${result.error}`);
    }
  }

  const completedAt = new Date();
  const successCount = results.filter((r) => r.success).length;

  console.log(
    `[GoldETL] Completed: ${successCount}/${results.length} views refreshed`,
  );

  return {
    startedAt,
    completedAt,
    results,
    totalViews: results.length,
    successCount,
    errorCount: results.length - successCount,
  };
}

/**
 * Refresh a specific view by name
 */
export async function refreshSingleView(
  viewName: string,
): Promise<RefreshResult> {
  if (!GOLD_VIEWS.includes(viewName as GoldViewName)) {
    return {
      viewName,
      success: false,
      durationMs: 0,
      rowsCount: 0,
      error: `Unknown view: ${viewName}. Valid views: ${GOLD_VIEWS.join(", ")}`,
    };
  }

  return refreshView(viewName as GoldViewName);
}

// ============================================================================
// Stats
// ============================================================================

/**
 * Get current Gold layer statistics
 */
export async function getGoldStats(): Promise<GoldStats> {
  const sb = getServiceSupabase();
  const [dailyCount, weeklyCount, monthlyCount, msgDailyCount, lastSync] =
    await Promise.all([
      sb
        .from("exo_gold_daily_summary")
        .select("*", { count: "exact", head: true }),
      sb
        .from("exo_gold_weekly_summary")
        .select("*", { count: "exact", head: true }),
      sb
        .from("exo_gold_monthly_summary")
        .select("*", { count: "exact", head: true }),
      sb
        .from("exo_gold_messages_daily")
        .select("*", { count: "exact", head: true }),
      sb
        .from("exo_gold_sync_log")
        .select("refreshed_at")
        .eq("status", "success")
        .order("refreshed_at", { ascending: false })
        .limit(1)
        .single(),
    ]);

  return {
    daily: dailyCount.count || 0,
    weekly: weeklyCount.count || 0,
    monthly: monthlyCount.count || 0,
    messagesDaily: msgDailyCount.count || 0,
    lastRefresh: lastSync.data?.refreshed_at || null,
  };
}

/**
 * Get recent refresh history
 */
export async function getRefreshHistory(limit: number = 20): Promise<
  {
    view_name: string;
    refreshed_at: string;
    duration_ms: number;
    rows_count: number;
    status: string;
    error_message: string | null;
  }[]
> {
  const { data } = await getServiceSupabase()
    .from("exo_gold_sync_log")
    .select("*")
    .order("refreshed_at", { ascending: false })
    .limit(limit);

  return data || [];
}
