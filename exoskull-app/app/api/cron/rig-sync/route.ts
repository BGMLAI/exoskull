/**
 * CRON: Rig Sync — Syncs Google (Fit + Workspace) data for all tenants
 * Schedule: Every 30 minutes
 * Purpose: Keep health metrics, calendar, and email data fresh
 */

export const dynamic = "force-dynamic";
export const maxDuration = 55;

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { ensureFreshToken } from "@/lib/rigs/oauth";
import { createGoogleClient } from "@/lib/rigs/google/client";
import { ingestGmailMessages } from "@/lib/rigs/email-ingest";
import { logger } from "@/lib/logger";

interface HealthMetricInsert {
  tenant_id: string;
  metric_type: string;
  value: number;
  unit: string;
  recorded_at: string;
  source: string;
}

async function handler(_req: NextRequest) {
  const supabase = getServiceSupabase();

  // Get all active Google rig connections
  const { data: connections, error: connError } = await supabase
    .from("exo_rig_connections")
    .select("*, exo_tenants!inner(subscription_status)")
    .eq("rig_slug", "google")
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
      message: "No active Google connections",
      synced: 0,
    });
  }

  const results: Array<{
    tenantId: string;
    success: boolean;
    metrics: number;
    emails: number;
    events: number;
    error?: string;
  }> = [];

  for (const conn of connections) {
    const startTime = Date.now();
    try {
      // 1. Refresh token
      const freshToken = await ensureFreshToken(conn);
      if (freshToken !== conn.access_token) {
        conn.access_token = freshToken;
      }

      // 2. Mark as syncing
      await supabase
        .from("exo_rig_connections")
        .update({ sync_status: "syncing", sync_error: null })
        .eq("id", conn.id);

      // 3. Fetch all Google data
      const client = createGoogleClient(conn);
      if (!client) throw new Error("Failed to create Google client");

      const dashboard = await client.getDashboardData();

      // 4. Build and upsert health metrics
      const metrics = buildMetrics(conn.tenant_id, dashboard.fit, "google");
      if (metrics.length > 0) {
        const { error: upsertErr } = await supabase
          .from("exo_health_metrics")
          .upsert(metrics, {
            onConflict: "tenant_id,metric_type,recorded_at,source",
            ignoreDuplicates: true,
          });
        if (upsertErr) {
          logger.warn("[RigSyncCRON] Metrics upsert error:", upsertErr.message);
        }
      }

      // 5. Ingest emails
      const userEmail = dashboard.workspace.gmail.recentEmails[0]?.to || "";
      const emailResult = await ingestGmailMessages(
        conn.tenant_id,
        dashboard.workspace.gmail.recentEmails,
        userEmail,
      );

      // 6. Update connection status
      const duration = Date.now() - startTime;
      await supabase
        .from("exo_rig_connections")
        .update({
          sync_status: "success",
          sync_error: null,
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", conn.id);

      // 7. Log sync
      await supabase.from("exo_rig_sync_log").insert({
        tenant_id: conn.tenant_id,
        rig_slug: "google",
        status: "success",
        records_synced:
          metrics.length +
          emailResult.ingested +
          dashboard.workspace.calendar.todaysEvents.length,
        sync_type: "cron",
      });

      results.push({
        tenantId: conn.tenant_id,
        success: true,
        metrics: metrics.length,
        emails: emailResult.ingested,
        events: dashboard.workspace.calendar.todaysEvents.length,
      });

      logger.info(
        `[RigSyncCRON] ${conn.tenant_id}: ${metrics.length} metrics, ${emailResult.ingested} emails in ${duration}ms`,
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error(`[RigSyncCRON] ${conn.tenant_id} failed:`, errorMsg);

      await supabase
        .from("exo_rig_connections")
        .update({ sync_status: "error", sync_error: errorMsg })
        .eq("id", conn.id);

      results.push({
        tenantId: conn.tenant_id,
        success: false,
        metrics: 0,
        emails: 0,
        events: 0,
        error: errorMsg,
      });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const totalMetrics = results.reduce((s, r) => s + r.metrics, 0);

  return NextResponse.json({
    synced: successCount,
    failed: results.length - successCount,
    totalMetrics,
    details: results,
  });
}

export const GET = withCronGuard({ name: "rig-sync" }, handler);

// ── Helpers ──────────────────────────────────────────────────────

function toRecordedAt(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toISOString();
}

function buildMetrics(
  tenantId: string,
  fit: {
    steps: { date: string; steps: number }[];
    heartRate: { date: string; bpm: number }[];
    calories: { date: string; calories: number }[];
    sleep: { date: string; durationMinutes: number }[];
  },
  source: string,
): HealthMetricInsert[] {
  const metrics: HealthMetricInsert[] = [];

  for (const item of fit.steps) {
    if (item.steps > 0) {
      metrics.push({
        tenant_id: tenantId,
        metric_type: "steps",
        value: item.steps,
        unit: "count",
        recorded_at: toRecordedAt(item.date),
        source,
      });
    }
  }
  for (const item of fit.heartRate) {
    if (item.bpm > 0) {
      metrics.push({
        tenant_id: tenantId,
        metric_type: "heart_rate",
        value: item.bpm,
        unit: "bpm",
        recorded_at: toRecordedAt(item.date),
        source,
      });
    }
  }
  for (const item of fit.calories) {
    if (item.calories > 0) {
      metrics.push({
        tenant_id: tenantId,
        metric_type: "calories",
        value: item.calories,
        unit: "kcal",
        recorded_at: toRecordedAt(item.date),
        source,
      });
    }
  }
  for (const item of fit.sleep) {
    if (item.durationMinutes > 0) {
      metrics.push({
        tenant_id: tenantId,
        metric_type: "sleep",
        value: item.durationMinutes,
        unit: "minutes",
        recorded_at: toRecordedAt(item.date),
        source,
      });
    }
  }

  return metrics;
}
