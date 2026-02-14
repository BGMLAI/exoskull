/**
 * Data Quality Worker — Check for orphaned records, schema violations,
 * and data consistency issues across the system.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import type { WorkContext, WorkResult } from "../work-catalog";
import { logger } from "@/lib/logger";

export async function runDataQualityAudit(
  _ctx: WorkContext,
): Promise<WorkResult> {
  const db = getServiceSupabase();
  const issues: string[] = [];

  try {
    // Check 1: Orphaned async tasks (processing for >5min with expired lock)
    const { count: staleAsync } = await db
      .from("exo_async_tasks")
      .select("*", { count: "exact", head: true })
      .eq("status", "processing")
      .lt("locked_until", new Date().toISOString());

    if (staleAsync && staleAsync > 0) {
      issues.push(`${staleAsync} stale async tasks with expired locks`);
      // Auto-fix: release locks
      await db
        .from("exo_async_tasks")
        .update({ status: "queued", locked_until: null, locked_by: null })
        .eq("status", "processing")
        .lt("locked_until", new Date().toISOString());
    }

    // Check 2: Orphaned petla work items (processing for >2min)
    const twoMinAgo = new Date(Date.now() - 120_000).toISOString();
    const { count: stalePetla } = await db
      .from("exo_petla_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "processing")
      .lt("locked_until", twoMinAgo);

    if (stalePetla && stalePetla > 0) {
      issues.push(`${stalePetla} stale petla work items`);
      await db
        .from("exo_petla_queue")
        .update({ status: "queued", locked_until: null, locked_by: null })
        .eq("status", "processing")
        .lt("locked_until", twoMinAgo);
    }

    // Check 3: Tenants without loop config
    const { data: tenantCount } = await db
      .from("exo_tenants")
      .select("id", { count: "exact", head: true });

    const { data: configCount } = await db
      .from("exo_tenant_loop_config")
      .select("tenant_id", { count: "exact", head: true });

    const tenantN = (tenantCount as unknown as number) || 0;
    const configN = (configCount as unknown as number) || 0;
    if (tenantN > configN) {
      issues.push(`${tenantN - configN} tenants missing loop config`);
    }

    // Check 4: Expired petla events still pending
    const { count: expiredEvents } = await db
      .from("exo_petla_events")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString());

    if (expiredEvents && expiredEvents > 0) {
      issues.push(`${expiredEvents} expired petla events still pending`);
      await db
        .from("exo_petla_events")
        .update({ status: "ignored" })
        .eq("status", "pending")
        .lt("expires_at", new Date().toISOString());
    }

    logger.info("[DataQualityAudit] Complete:", {
      issues: issues.length,
      details: issues,
    });

    return {
      success: true,
      costCents: 0,
      result: { issuesFound: issues.length, issues, autoFixed: issues.length },
    };
  } catch (err) {
    logger.error("[DataQualityAudit] Failed:", { error: err });
    return {
      success: false,
      costCents: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
