// =====================================================
// APPLE HEALTH SYNC API - Receives data from iOS bridge
// Mirrors Health Connect pattern (same metrics, same table)
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Valid metric types (same as Health Connect)
const VALID_METRIC_TYPES = [
  "steps",
  "sleep",
  "heart_rate",
  "hrv",
  "calories",
  "distance",
  "active_minutes",
  "floors_climbed",
  "blood_pressure_systolic",
  "blood_pressure_diastolic",
  "blood_oxygen",
  "body_temperature",
  "weight",
  "body_fat",
  // Apple Health specific
  "stand_hours",
  "exercise_minutes",
  "mindful_minutes",
  "respiratory_rate",
  "vo2_max",
] as const;

type MetricType = (typeof VALID_METRIC_TYPES)[number];

interface HealthMetric {
  type: MetricType;
  value: number;
  unit: string;
  recorded_at: string;
  metadata?: Record<string, unknown>;
}

interface SyncPayload {
  metrics: HealthMetric[];
  device_info?: {
    model?: string;
    os_version?: string;
    app_version?: string;
  };
}

// =====================================================
// POST /api/rigs/apple-health/sync - Receive health data
// =====================================================

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  const startTime = Date.now();

  try {
    // Get tenant ID from header or auth token
    const tenantId = request.headers.get("x-tenant-id");
    const authHeader = request.headers.get("authorization");

    let userId: string | null = tenantId;

    if (!userId && authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);
      if (!error && user) {
        userId = user.id;
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized - missing tenant ID or valid token" },
        { status: 401 },
      );
    }

    const payload: SyncPayload = await request.json();

    if (!payload.metrics || !Array.isArray(payload.metrics)) {
      return NextResponse.json(
        { error: "Invalid payload - metrics array required" },
        { status: 400 },
      );
    }

    if (payload.metrics.length === 0) {
      return NextResponse.json({
        success: true,
        records_synced: 0,
        message: "No metrics to sync",
      });
    }

    // Validate metrics
    const validMetrics: HealthMetric[] = [];
    const errors: string[] = [];

    for (const metric of payload.metrics) {
      if (!VALID_METRIC_TYPES.includes(metric.type as MetricType)) {
        errors.push(`Invalid metric type: ${metric.type}`);
        continue;
      }
      if (typeof metric.value !== "number" || isNaN(metric.value)) {
        errors.push(`Invalid value for ${metric.type}: ${metric.value}`);
        continue;
      }
      if (!metric.recorded_at) {
        errors.push(`Missing recorded_at for ${metric.type}`);
        continue;
      }
      validMetrics.push(metric);
    }

    if (validMetrics.length === 0) {
      return NextResponse.json(
        { error: "No valid metrics", details: errors },
        { status: 400 },
      );
    }

    // Ensure connection exists
    const { data: existingConnection } = await supabase
      .from("exo_rig_connections")
      .select("id")
      .eq("tenant_id", userId)
      .eq("rig_slug", "apple-health")
      .single();

    let connectionId: string;

    if (!existingConnection) {
      const { data: newConnection, error: createError } = await supabase
        .from("exo_rig_connections")
        .insert({
          tenant_id: userId,
          rig_slug: "apple-health",
          token_type: "device",
          scopes: VALID_METRIC_TYPES,
          metadata: {
            source: "ios-bridge",
            device_info: payload.device_info || {},
            first_sync: new Date().toISOString(),
          },
          sync_status: "success",
        })
        .select("id")
        .single();

      if (createError) {
        console.error(
          "[Apple Health] Failed to create connection:",
          createError,
        );
        return NextResponse.json(
          { error: "Failed to create connection" },
          { status: 500 },
        );
      }
      connectionId = newConnection.id;
    } else {
      connectionId = existingConnection.id;
    }

    // Insert metrics into exo_health_metrics
    const metricsToInsert = validMetrics.map((m) => ({
      tenant_id: userId,
      metric_type: m.type,
      value: m.value,
      unit: m.unit || getDefaultUnit(m.type),
      recorded_at: m.recorded_at,
      source: "apple-health",
      metadata: {
        ...m.metadata,
        device_info: payload.device_info,
      },
    }));

    const { error: insertError } = await supabase
      .from("exo_health_metrics")
      .upsert(metricsToInsert, {
        onConflict: "tenant_id,metric_type,recorded_at",
        ignoreDuplicates: true,
      });

    if (insertError) {
      console.error("[Apple Health] Failed to insert metrics:", insertError);
      return NextResponse.json(
        { error: "Failed to save metrics", details: insertError.message },
        { status: 500 },
      );
    }

    const duration = Date.now() - startTime;

    // Update connection status
    const { data: currentConn } = await supabase
      .from("exo_rig_connections")
      .select("metadata")
      .eq("id", connectionId)
      .single();

    await supabase
      .from("exo_rig_connections")
      .update({
        sync_status: "success",
        sync_error: null,
        last_sync_at: new Date().toISOString(),
        metadata: {
          ...(currentConn?.metadata || {}),
          last_device_info: payload.device_info,
          last_metrics_count: validMetrics.length,
          last_sync_timestamp: new Date().toISOString(),
        },
      })
      .eq("id", connectionId);

    // Log sync
    await supabase.from("exo_rig_sync_log").insert({
      connection_id: connectionId,
      tenant_id: userId,
      rig_slug: "apple-health",
      success: true,
      records_synced: validMetrics.length,
      duration_ms: duration,
      metadata: {
        metric_types: [...new Set(validMetrics.map((m) => m.type))],
        device_info: payload.device_info,
        validation_errors: errors.length > 0 ? errors : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      records_synced: validMetrics.length,
      duration_ms: duration,
      validation_errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = (error as Error).message;

    console.error("[Apple Health] Sync failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        duration_ms: duration,
      },
      { status: 500 },
    );
  }
}

// =====================================================
// GET /api/rigs/apple-health/sync - Get sync status
// =====================================================

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const tenantId = request.headers.get("x-tenant-id");
  const authHeader = request.headers.get("authorization");

  let userId: string | null = tenantId;

  if (!userId && authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (user) userId = user.id;
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: connection } = await supabase
    .from("exo_rig_connections")
    .select("id, sync_status, sync_error, last_sync_at, metadata, created_at")
    .eq("tenant_id", userId)
    .eq("rig_slug", "apple-health")
    .single();

  if (!connection) {
    return NextResponse.json({
      connected: false,
      slug: "apple-health",
      message:
        "Apple Health not configured. Install iOS bridge to start syncing.",
    });
  }

  // Get recent metrics summary (last 24h)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const { data: recentMetrics } = await supabase
    .from("exo_health_metrics")
    .select("metric_type, value, unit, recorded_at")
    .eq("tenant_id", userId)
    .eq("source", "apple-health")
    .gte("recorded_at", yesterday.toISOString())
    .order("recorded_at", { ascending: false })
    .limit(100);

  // Aggregate by type
  const metricsByType: Record<
    string,
    { latest: number; unit: string; count: number; lastUpdated: string }
  > = {};

  for (const m of recentMetrics || []) {
    if (!metricsByType[m.metric_type]) {
      metricsByType[m.metric_type] = {
        latest: m.value,
        unit: m.unit,
        count: 1,
        lastUpdated: m.recorded_at,
      };
    } else {
      metricsByType[m.metric_type].count++;
    }
  }

  const { data: logs } = await supabase
    .from("exo_rig_sync_log")
    .select("success, records_synced, error, duration_ms, created_at")
    .eq("connection_id", connection.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({
    connected: true,
    slug: "apple-health",
    sync_status: connection.sync_status,
    sync_error: connection.sync_error,
    last_sync_at: connection.last_sync_at,
    connected_since: connection.created_at,
    metadata: connection.metadata,
    metrics_summary: metricsByType,
    recent_syncs: logs || [],
  });
}

// =====================================================
// HELPERS
// =====================================================

function getDefaultUnit(type: MetricType): string {
  const units: Record<string, string> = {
    steps: "count",
    sleep: "minutes",
    heart_rate: "bpm",
    hrv: "ms",
    calories: "kcal",
    distance: "meters",
    active_minutes: "minutes",
    floors_climbed: "count",
    blood_pressure_systolic: "mmHg",
    blood_pressure_diastolic: "mmHg",
    blood_oxygen: "percent",
    body_temperature: "celsius",
    weight: "kg",
    body_fat: "percent",
    stand_hours: "hours",
    exercise_minutes: "minutes",
    mindful_minutes: "minutes",
    respiratory_rate: "breaths/min",
    vo2_max: "mL/kg/min",
  };
  return units[type] || "unknown";
}
