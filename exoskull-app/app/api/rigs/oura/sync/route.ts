// =====================================================
// OURA SYNC API - Sync sleep/activity/HRV into exo_health_metrics
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import { OuraClient } from "@/lib/rigs/oura/client";
import type {
  OuraSleepPeriod,
  OuraDailyActivity,
} from "@/lib/rigs/oura/client";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 7;

interface HealthMetricInsert {
  tenant_id: string;
  metric_type: string;
  value: number;
  unit: string;
  recorded_at: string;
  source: string;
  metadata?: Record<string, unknown>;
}

// =====================================================
// POST /api/rigs/oura/sync - Trigger Oura sync
// =====================================================

export async function POST(request: NextRequest) {
  const supabase = getServiceSupabase();
  const startTime = Date.now();

  const auth = await verifyTenantAuth(request);
  if (!auth.ok) return auth.response;
  const tenantIdValue = auth.tenantId;

  try {
    const { days: bodyDays } = (await request.json().catch(() => ({}))) as {
      days?: number;
    };
    const queryDays = request.nextUrl.searchParams.get("days");
    const days = normalizeDays(queryDays, bodyDays);

    const { data: connection, error: connError } = await supabase
      .from("exo_rig_connections")
      .select("*")
      .eq("tenant_id", tenantIdValue)
      .eq("rig_slug", "oura")
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: "Rig not connected", slug: "oura" },
        { status: 404 },
      );
    }

    if (!connection.access_token) {
      return NextResponse.json(
        { error: "Missing access token", slug: "oura" },
        { status: 400 },
      );
    }

    await supabase
      .from("exo_rig_connections")
      .update({ sync_status: "syncing", sync_error: null })
      .eq("id", connection.id);

    const client = new OuraClient(connection.access_token);

    const dateRange = getDateRange(days);
    const [sleepPeriods, dailyActivity] = await Promise.all([
      client.getSleepPeriods(dateRange.startDate, dateRange.endDate),
      client.getDailyActivity(dateRange.startDate, dateRange.endDate),
    ]);

    const metrics = buildMetricsFromOura({
      tenantId: tenantIdValue,
      sleepPeriods: sleepPeriods.data || [],
      dailyActivity: dailyActivity.data || [],
      source: "oura",
    });

    if (metrics.length > 0) {
      const { error: insertError } = await supabase
        .from("exo_health_metrics")
        .upsert(metrics, {
          onConflict: "tenant_id,metric_type,recorded_at,source",
          ignoreDuplicates: true,
        });

      if (insertError) {
        console.error("[Oura Sync] Failed to upsert metrics:", {
          error: insertError.message,
          tenantId: tenantIdValue,
          count: metrics.length,
        });
        throw new Error("Failed to save health metrics");
      }
    }

    const duration = Date.now() - startTime;

    await supabase
      .from("exo_rig_connections")
      .update({
        sync_status: "success",
        sync_error: null,
        last_sync_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    await supabase.from("exo_rig_sync_log").insert({
      connection_id: connection.id,
      tenant_id: tenantIdValue,
      rig_slug: "oura",
      success: true,
      records_synced: metrics.length,
      duration_ms: duration,
      metadata: {
        days,
        metrics: summarizeMetrics(metrics),
      },
    });

    return NextResponse.json({
      success: true,
      slug: "oura",
      records_synced: metrics.length,
      duration_ms: duration,
      data: {
        days,
        metrics: summarizeMetrics(metrics),
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : "Unknown error";

    console.error("[Oura Sync] Failed:", error);

    await supabase
      .from("exo_rig_connections")
      .update({
        sync_status: "error",
        sync_error: message,
      })
      .eq("tenant_id", tenantIdValue)
      .eq("rig_slug", "oura");

    return NextResponse.json(
      { success: false, slug: "oura", error: message, duration_ms: duration },
      { status: 500 },
    );
  }
}

// =====================================================
// GET /api/rigs/oura/sync - Sync status
// =====================================================

export async function GET(request: NextRequest) {
  const supabase = getServiceSupabase();

  const auth = await verifyTenantAuth(request);
  if (!auth.ok) return auth.response;
  const tenantId = auth.tenantId;

  const { data: connection, error: connError } = await supabase
    .from("exo_rig_connections")
    .select("id, sync_status, sync_error, last_sync_at, metadata")
    .eq("tenant_id", tenantId)
    .eq("rig_slug", "oura")
    .single();

  if (connError || !connection) {
    return NextResponse.json(
      { connected: false, slug: "oura" },
      { status: 200 },
    );
  }

  const { data: logs } = await supabase
    .from("exo_rig_sync_log")
    .select("success, records_synced, error, duration_ms, created_at")
    .eq("connection_id", connection.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({
    connected: true,
    slug: "oura",
    sync_status: connection.sync_status,
    sync_error: connection.sync_error,
    last_sync_at: connection.last_sync_at,
    metadata: connection.metadata,
    recent_syncs: logs || [],
  });
}

// =====================================================
// HELPERS
// =====================================================

function normalizeDays(queryDays: string | null, bodyDays?: number): number {
  const parsedQuery = queryDays ? parseInt(queryDays, 10) : undefined;
  const candidate = bodyDays || parsedQuery || DEFAULT_DAYS;
  if (Number.isNaN(candidate) || candidate <= 0) return DEFAULT_DAYS;
  return Math.min(candidate, 90);
}

function getDateRange(days: number) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return {
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
  };
}

function buildMetricsFromOura(params: {
  tenantId: string;
  sleepPeriods: OuraSleepPeriod[];
  dailyActivity: OuraDailyActivity[];
  source: string;
}): HealthMetricInsert[] {
  const sleepByDay = new Map<
    string,
    {
      totalSleepSeconds: number;
      longestSleepSeconds: number;
      hrv: number | null;
      heartRate: number | null;
    }
  >();

  for (const period of params.sleepPeriods) {
    if (period.type !== "sleep" && period.type !== "long_sleep") continue;

    const existing = sleepByDay.get(period.day) || {
      totalSleepSeconds: 0,
      longestSleepSeconds: 0,
      hrv: null,
      heartRate: null,
    };

    existing.totalSleepSeconds += period.total_sleep_duration;

    if (period.total_sleep_duration >= existing.longestSleepSeconds) {
      existing.longestSleepSeconds = period.total_sleep_duration;
      existing.hrv = period.average_hrv ?? null;
      existing.heartRate = period.average_heart_rate ?? null;
    }

    sleepByDay.set(period.day, existing);
  }

  const activityByDay = new Map<string, { steps: number; calories: number }>();
  for (const activity of params.dailyActivity) {
    activityByDay.set(activity.day, {
      steps: activity.steps || 0,
      calories: activity.active_calories || 0,
    });
  }

  const allDays = new Set<string>([
    ...sleepByDay.keys(),
    ...activityByDay.keys(),
  ]);

  const metrics: HealthMetricInsert[] = [];

  for (const day of allDays) {
    const recordedAt = new Date(`${day}T00:00:00.000Z`).toISOString();

    const sleep = sleepByDay.get(day);
    if (sleep && sleep.totalSleepSeconds > 0) {
      metrics.push({
        tenant_id: params.tenantId,
        metric_type: "sleep",
        value: Math.round(sleep.totalSleepSeconds / 60),
        unit: "minutes",
        recorded_at: recordedAt,
        source: params.source,
      });
    }

    if (sleep?.hrv !== null && sleep?.hrv !== undefined) {
      metrics.push({
        tenant_id: params.tenantId,
        metric_type: "hrv",
        value: Math.round(sleep.hrv),
        unit: "ms",
        recorded_at: recordedAt,
        source: params.source,
      });
    }

    if (sleep?.heartRate !== null && sleep?.heartRate !== undefined) {
      metrics.push({
        tenant_id: params.tenantId,
        metric_type: "heart_rate",
        value: Math.round(sleep.heartRate),
        unit: "bpm",
        recorded_at: recordedAt,
        source: params.source,
      });
    }

    const activity = activityByDay.get(day);
    if (activity?.steps && activity.steps > 0) {
      metrics.push({
        tenant_id: params.tenantId,
        metric_type: "steps",
        value: activity.steps,
        unit: "count",
        recorded_at: recordedAt,
        source: params.source,
      });
    }

    if (activity?.calories && activity.calories > 0) {
      metrics.push({
        tenant_id: params.tenantId,
        metric_type: "calories",
        value: activity.calories,
        unit: "kcal",
        recorded_at: recordedAt,
        source: params.source,
      });
    }
  }

  return metrics;
}

function summarizeMetrics(metrics: HealthMetricInsert[]) {
  return metrics.reduce<Record<string, number>>((acc, metric) => {
    acc[metric.metric_type] = (acc[metric.metric_type] || 0) + 1;
    return acc;
  }, {});
}
