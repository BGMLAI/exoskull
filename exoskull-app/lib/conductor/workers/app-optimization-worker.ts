/**
 * App Optimization Worker — Analyze usage patterns of generated apps
 * and track their health.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import type { WorkContext, WorkResult } from "../work-catalog";
import { logger } from "@/lib/logger";

export async function runAppOptimization(
  ctx: WorkContext,
): Promise<WorkResult> {
  const tenantId = ctx.tenantId!;
  const db = getServiceSupabase();

  try {
    // Get active apps
    const { data: apps } = await db
      .from("exo_generated_apps")
      .select("id, slug, name, status, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "active");

    if (!apps || apps.length === 0) {
      return { success: true, costCents: 0, result: { analyzed: 0 } };
    }

    const results: Array<{ slug: string; rows: number; stale: boolean }> = [];

    for (const app of apps) {
      try {
        // Check data row count for each app table
        const tableName = `exo_app_${app.slug}`;
        const { count } = await db
          .from(tableName)
          .select("*", { count: "exact", head: true });

        const rowCount = count || 0;
        const daysSinceCreation =
          (Date.now() - new Date(app.created_at).getTime()) / 86_400_000;
        const isStale = rowCount === 0 && daysSinceCreation > 7;

        results.push({ slug: app.slug, rows: rowCount, stale: isStale });
      } catch {
        // Table might not exist yet
        results.push({ slug: app.slug, rows: -1, stale: false });
      }
    }

    const staleApps = results.filter((r) => r.stale);
    const activeApps = results.filter((r) => r.rows > 0);

    logger.info("[AppOptimization] Analysis:", {
      tenantId: tenantId.slice(0, 8),
      total: apps.length,
      active: activeApps.length,
      stale: staleApps.length,
    });

    return {
      success: true,
      costCents: 0,
      result: {
        analyzed: apps.length,
        activeWithData: activeApps.length,
        stale: staleApps.map((a) => a.slug),
      },
    };
  } catch (err) {
    logger.error("[AppOptimization] Failed:", { tenantId, error: err });
    return {
      success: false,
      costCents: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
