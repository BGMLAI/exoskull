/**
 * CRON: Universal Rig Sync — Syncs ALL connected rigs for all tenants
 * Schedule: Every 30 minutes
 * Purpose: Keep health metrics, calendar, email, tasks, and social data fresh
 */

export const dynamic = "force-dynamic";
export const maxDuration = 55;

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { ensureFreshToken } from "@/lib/rigs/oauth";
import { CRON_SYNCABLE_SLUGS, syncRig } from "@/lib/rigs/rig-syncer";
import { RigConnection } from "@/lib/rigs/types";
import { logger } from "@/lib/logger";

const OAUTH_REQUIRED_RIGS = new Set([
  "google",
  "google-fit",
  "google-workspace",
  "google-calendar",
  "microsoft-365",
  "oura",
  "fitbit",
  "facebook",
]);

async function handler(_req: NextRequest) {
  const supabase = getServiceSupabase();

  // Get ALL active rig connections for CRON-syncable slugs
  const { data: connections, error: connError } = await supabase
    .from("exo_rig_connections")
    .select("*, exo_tenants!inner(subscription_status)")
    .in("rig_slug", [...CRON_SYNCABLE_SLUGS])
    .eq("exo_tenants.subscription_status", "active")
    .not("refresh_token", "is", null);

  if (connError) {
    logger.error(
      "[RigSyncCRON] Failed to fetch connections:",
      connError.message,
    );
    return NextResponse.json({ error: connError.message }, { status: 500 });
  }

  if (!connections || connections.length === 0) {
    return NextResponse.json({
      message: "No active rig connections",
      synced: 0,
    });
  }

  const results: Array<{
    tenantId: string;
    slug: string;
    success: boolean;
    records: number;
    error?: string;
  }> = [];

  for (const conn of connections) {
    const startTime = Date.now();
    try {
      // 1. Refresh token
      try {
        const freshToken = await ensureFreshToken(conn);
        if (freshToken !== conn.access_token) {
          conn.access_token = freshToken;
        }
      } catch (tokenError) {
        if (OAUTH_REQUIRED_RIGS.has(conn.rig_slug)) {
          throw new Error(
            `Token refresh failed for ${conn.rig_slug}: ${(tokenError as Error).message}`,
          );
        }
        logger.warn(
          `[RigSyncCRON] Token refresh skipped for ${conn.rig_slug}:`,
          (tokenError as Error).message,
        );
      }

      // 2. Mark as syncing
      await supabase
        .from("exo_rig_connections")
        .update({ sync_status: "syncing", sync_error: null })
        .eq("id", conn.id);

      // 3. Sync via universal dispatcher
      const syncResult = await syncRig(
        conn as unknown as RigConnection,
        supabase,
      );

      // 4. Update connection status
      await supabase
        .from("exo_rig_connections")
        .update({
          sync_status: syncResult.success ? "success" : "error",
          sync_error: syncResult.error || null,
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", conn.id);

      // 5. Log sync
      const duration = Date.now() - startTime;
      await supabase.from("exo_rig_sync_log").insert({
        tenant_id: conn.tenant_id,
        rig_slug: conn.rig_slug,
        status: syncResult.success ? "success" : "error",
        records_synced: syncResult.records,
        sync_type: "cron",
        duration_ms: duration,
      });

      results.push({
        tenantId: conn.tenant_id,
        slug: conn.rig_slug,
        success: syncResult.success,
        records: syncResult.records,
        error: syncResult.error,
      });

      logger.info(
        `[RigSyncCRON] ${conn.tenant_id}/${conn.rig_slug}: ${syncResult.records} records in ${duration}ms`,
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error(
        `[RigSyncCRON] ${conn.tenant_id}/${conn.rig_slug} failed:`,
        errorMsg,
      );

      await supabase
        .from("exo_rig_connections")
        .update({ sync_status: "error", sync_error: errorMsg })
        .eq("id", conn.id);

      results.push({
        tenantId: conn.tenant_id,
        slug: conn.rig_slug,
        success: false,
        records: 0,
        error: errorMsg,
      });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const totalRecords = results.reduce((s, r) => s + r.records, 0);
  const slugBreakdown = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.slug] = (acc[r.slug] || 0) + (r.success ? 1 : 0);
    return acc;
  }, {});

  return NextResponse.json({
    synced: successCount,
    failed: results.length - successCount,
    totalRecords,
    slugBreakdown,
    details: results,
  });
}

export const GET = withCronGuard({ name: "rig-sync" }, handler);
