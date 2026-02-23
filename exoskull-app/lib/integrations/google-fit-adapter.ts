/**
 * Health Data Adapter (formerly Google Fit Direct Adapter)
 *
 * Google Fit REST API was shut down June 2025. All READ functions now query
 * exo_health_metrics table (data sourced from Oura, Health Connect, manual input).
 * WRITE functions store directly to exo_health_metrics with source: "manual".
 *
 * Same exported function signatures — no downstream changes needed.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

// ============================================================================
// READ: Steps
// ============================================================================

export async function getSteps(
  tenantId: string,
  startDate: Date,
  endDate: Date,
): Promise<{
  ok: boolean;
  steps?: Array<{ date: string; count: number }>;
  error?: string;
}> {
  try {
    const { data, error } = await getServiceSupabase()
      .from("exo_health_metrics")
      .select("recorded_at, value")
      .eq("tenant_id", tenantId)
      .eq("metric_type", "steps")
      .gte("recorded_at", startDate.toISOString())
      .lte("recorded_at", endDate.toISOString())
      .order("recorded_at", { ascending: true });

    if (error) return { ok: false, error: error.message };

    const steps = (data || []).map((r) => ({
      date: new Date(r.recorded_at).toISOString().split("T")[0],
      count: r.value,
    }));

    return { ok: true, steps };
  } catch (err) {
    logger.error("[HealthAdapter] getSteps failed:", err);
    return {
      ok: false,
      error: `Błąd: ${err instanceof Error ? err.message : err}`,
    };
  }
}

// ============================================================================
// READ: Heart Rate
// ============================================================================

export async function getHeartRate(
  tenantId: string,
  startDate: Date,
  endDate: Date,
): Promise<{
  ok: boolean;
  data?: Array<{ date: string; avg: number; min: number; max: number }>;
  error?: string;
}> {
  try {
    const { data, error } = await getServiceSupabase()
      .from("exo_health_metrics")
      .select("recorded_at, value")
      .eq("tenant_id", tenantId)
      .eq("metric_type", "heart_rate")
      .gte("recorded_at", startDate.toISOString())
      .lte("recorded_at", endDate.toISOString())
      .order("recorded_at", { ascending: true });

    if (error) return { ok: false, error: error.message };

    // Group by day, compute avg/min/max
    const byDay = new Map<string, number[]>();
    for (const r of data || []) {
      const day = new Date(r.recorded_at).toISOString().split("T")[0];
      const arr = byDay.get(day) || [];
      arr.push(r.value);
      byDay.set(day, arr);
    }

    const result = Array.from(byDay.entries()).map(([date, values]) => ({
      date,
      avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      min: Math.round(Math.min(...values)),
      max: Math.round(Math.max(...values)),
    }));

    return { ok: true, data: result };
  } catch (err) {
    logger.error("[HealthAdapter] getHeartRate failed:", err);
    return {
      ok: false,
      error: `Błąd: ${err instanceof Error ? err.message : err}`,
    };
  }
}

// ============================================================================
// READ: Sleep Sessions
// ============================================================================

export async function getSleepSessions(
  tenantId: string,
  startDate: Date,
  endDate: Date,
): Promise<{
  ok: boolean;
  sessions?: Array<{
    date: string;
    durationHours: number;
    startTime: string;
    endTime: string;
  }>;
  error?: string;
}> {
  try {
    const { data, error } = await getServiceSupabase()
      .from("exo_health_metrics")
      .select("recorded_at, value")
      .eq("tenant_id", tenantId)
      .eq("metric_type", "sleep")
      .gte("recorded_at", startDate.toISOString())
      .lte("recorded_at", endDate.toISOString())
      .order("recorded_at", { ascending: true });

    if (error) return { ok: false, error: error.message };

    const sessions = (data || []).map((r) => {
      const recordedAt = new Date(r.recorded_at);
      const durationMinutes = r.value;
      return {
        date: recordedAt.toISOString().split("T")[0],
        durationHours: Math.round((durationMinutes / 60) * 10) / 10,
        startTime: recordedAt.toISOString(),
        endTime: new Date(
          recordedAt.getTime() + durationMinutes * 60000,
        ).toISOString(),
      };
    });

    return { ok: true, sessions };
  } catch (err) {
    logger.error("[HealthAdapter] getSleepSessions failed:", err);
    return {
      ok: false,
      error: `Błąd: ${err instanceof Error ? err.message : err}`,
    };
  }
}

// ============================================================================
// READ: Calories
// ============================================================================

export async function getCalories(
  tenantId: string,
  startDate: Date,
  endDate: Date,
): Promise<{
  ok: boolean;
  calories?: Array<{ date: string; kcal: number }>;
  error?: string;
}> {
  try {
    const { data, error } = await getServiceSupabase()
      .from("exo_health_metrics")
      .select("recorded_at, value")
      .eq("tenant_id", tenantId)
      .eq("metric_type", "calories")
      .gte("recorded_at", startDate.toISOString())
      .lte("recorded_at", endDate.toISOString())
      .order("recorded_at", { ascending: true });

    if (error) return { ok: false, error: error.message };

    const calories = (data || []).map((r) => ({
      date: new Date(r.recorded_at).toISOString().split("T")[0],
      kcal: Math.round(r.value),
    }));

    return { ok: true, calories };
  } catch (err) {
    logger.error("[HealthAdapter] getCalories failed:", err);
    return {
      ok: false,
      error: `Błąd: ${err instanceof Error ? err.message : err}`,
    };
  }
}

// ============================================================================
// READ: Weight
// ============================================================================

export async function getWeight(
  tenantId: string,
  startDate: Date,
  endDate: Date,
): Promise<{
  ok: boolean;
  data?: Array<{ date: string; kg: number }>;
  error?: string;
}> {
  try {
    const { data, error } = await getServiceSupabase()
      .from("exo_health_metrics")
      .select("recorded_at, value")
      .eq("tenant_id", tenantId)
      .eq("metric_type", "weight")
      .gte("recorded_at", startDate.toISOString())
      .lte("recorded_at", endDate.toISOString())
      .order("recorded_at", { ascending: true });

    if (error) return { ok: false, error: error.message };

    const result = (data || []).map((r) => ({
      date: new Date(r.recorded_at).toISOString().split("T")[0],
      kg: Math.round(r.value * 10) / 10,
    }));

    return { ok: true, data: result };
  } catch (err) {
    logger.error("[HealthAdapter] getWeight failed:", err);
    return {
      ok: false,
      error: `Błąd: ${err instanceof Error ? err.message : err}`,
    };
  }
}

// ============================================================================
// READ: Blood Pressure
// ============================================================================

export async function getBloodPressure(
  tenantId: string,
  startDate: Date,
  endDate: Date,
): Promise<{
  ok: boolean;
  data?: Array<{ date: string; systolic: number; diastolic: number }>;
  error?: string;
}> {
  try {
    const { data, error } = await getServiceSupabase()
      .from("exo_health_metrics")
      .select("recorded_at, value, metadata")
      .eq("tenant_id", tenantId)
      .eq("metric_type", "blood_pressure")
      .gte("recorded_at", startDate.toISOString())
      .lte("recorded_at", endDate.toISOString())
      .order("recorded_at", { ascending: true });

    if (error) return { ok: false, error: error.message };

    const result = (data || []).map((r) => ({
      date: new Date(r.recorded_at).toISOString().split("T")[0],
      systolic: Math.round(r.value),
      diastolic: Math.round(
        (r.metadata as Record<string, number> | null)?.diastolic || 0,
      ),
    }));

    return { ok: true, data: result };
  } catch (err) {
    logger.error("[HealthAdapter] getBloodPressure failed:", err);
    return {
      ok: false,
      error: `Błąd: ${err instanceof Error ? err.message : err}`,
    };
  }
}

// ============================================================================
// READ: Blood Glucose
// ============================================================================

export async function getBloodGlucose(
  tenantId: string,
  startDate: Date,
  endDate: Date,
): Promise<{
  ok: boolean;
  data?: Array<{ date: string; mmolL: number }>;
  error?: string;
}> {
  try {
    const { data, error } = await getServiceSupabase()
      .from("exo_health_metrics")
      .select("recorded_at, value")
      .eq("tenant_id", tenantId)
      .eq("metric_type", "blood_glucose")
      .gte("recorded_at", startDate.toISOString())
      .lte("recorded_at", endDate.toISOString())
      .order("recorded_at", { ascending: true });

    if (error) return { ok: false, error: error.message };

    const result = (data || []).map((r) => ({
      date: new Date(r.recorded_at).toISOString().split("T")[0],
      mmolL: Math.round(r.value * 10) / 10,
    }));

    return { ok: true, data: result };
  } catch (err) {
    logger.error("[HealthAdapter] getBloodGlucose failed:", err);
    return {
      ok: false,
      error: `Błąd: ${err instanceof Error ? err.message : err}`,
    };
  }
}

// ============================================================================
// WRITE: Log Weight
// ============================================================================

export async function logWeight(
  tenantId: string,
  weightKg: number,
): Promise<{ ok: boolean; formatted?: string; error?: string }> {
  try {
    const now = new Date();
    const { error } = await getServiceSupabase()
      .from("exo_health_metrics")
      .upsert(
        {
          tenant_id: tenantId,
          metric_type: "weight",
          value: weightKg,
          unit: "kg",
          recorded_at: now.toISOString(),
          source: "manual",
        },
        { onConflict: "tenant_id,metric_type,recorded_at,source" },
      );

    if (error) return { ok: false, error: error.message };
    return { ok: true, formatted: `Zapisano wagę: ${weightKg} kg` };
  } catch (err) {
    logger.error("[HealthAdapter] logWeight failed:", err);
    return {
      ok: false,
      error: `Błąd: ${err instanceof Error ? err.message : err}`,
    };
  }
}

// ============================================================================
// WRITE: Log Workout
// ============================================================================

export async function logWorkout(
  tenantId: string,
  activityType: string,
  durationMinutes: number,
  calories?: number,
): Promise<{ ok: boolean; formatted?: string; error?: string }> {
  try {
    const now = new Date();
    const supabase = getServiceSupabase();

    // Log to exo_health_metrics as activity
    const metrics: Array<{
      tenant_id: string;
      metric_type: string;
      value: number;
      unit: string;
      recorded_at: string;
      source: string;
      metadata?: Record<string, unknown>;
    }> = [
      {
        tenant_id: tenantId,
        metric_type: "activity",
        value: durationMinutes,
        unit: "minutes",
        recorded_at: now.toISOString(),
        source: "manual",
        metadata: { activity_type: activityType },
      },
    ];

    if (calories) {
      metrics.push({
        tenant_id: tenantId,
        metric_type: "calories",
        value: calories,
        unit: "kcal",
        recorded_at: now.toISOString(),
        source: "manual",
        metadata: { activity_type: activityType },
      });
    }

    const { error } = await supabase
      .from("exo_health_metrics")
      .upsert(metrics, {
        onConflict: "tenant_id,metric_type,recorded_at,source",
      });

    if (error) return { ok: false, error: error.message };

    const parts = [
      `Zapisano trening: ${activityType} (${durationMinutes} min)`,
    ];
    if (calories) parts.push(`${calories} kcal`);
    return { ok: true, formatted: parts.join(", ") };
  } catch (err) {
    logger.error("[HealthAdapter] logWorkout failed:", err);
    return {
      ok: false,
      error: `Błąd: ${err instanceof Error ? err.message : err}`,
    };
  }
}

// ============================================================================
// WRITE: Log Water Intake
// ============================================================================

export async function logWaterIntake(
  tenantId: string,
  amountMl: number,
): Promise<{ ok: boolean; formatted?: string; error?: string }> {
  try {
    const now = new Date();
    const { error } = await getServiceSupabase()
      .from("exo_health_metrics")
      .upsert(
        {
          tenant_id: tenantId,
          metric_type: "water",
          value: amountMl,
          unit: "ml",
          recorded_at: now.toISOString(),
          source: "manual",
        },
        { onConflict: "tenant_id,metric_type,recorded_at,source" },
      );

    if (error) return { ok: false, error: error.message };
    const liters = amountMl / 1000;
    return {
      ok: true,
      formatted: `Zapisano: ${amountMl} ml wody (${liters} l)`,
    };
  } catch (err) {
    logger.error("[HealthAdapter] logWaterIntake failed:", err);
    return {
      ok: false,
      error: `Błąd: ${err instanceof Error ? err.message : err}`,
    };
  }
}

// ============================================================================
// READ: Health Summary (comprehensive)
// ============================================================================

export async function getHealthSummary(
  tenantId: string,
  daysBack: number = 7,
): Promise<{ ok: boolean; summary?: string; error?: string }> {
  const end = new Date();
  const start = new Date(Date.now() - daysBack * 86400000);

  const [stepsRes, hrRes, sleepRes, calRes] = await Promise.allSettled([
    getSteps(tenantId, start, end),
    getHeartRate(tenantId, start, end),
    getSleepSessions(tenantId, start, end),
    getCalories(tenantId, start, end),
  ]);

  const lines: string[] = [`Podsumowanie zdrowia (ostatnie ${daysBack} dni):`];

  // Steps
  if (
    stepsRes.status === "fulfilled" &&
    stepsRes.value.ok &&
    stepsRes.value.steps?.length
  ) {
    const avgSteps = Math.round(
      stepsRes.value.steps.reduce((s, d) => s + d.count, 0) /
        stepsRes.value.steps.length,
    );
    const totalSteps = stepsRes.value.steps.reduce((s, d) => s + d.count, 0);
    lines.push(`\nKroki:`);
    lines.push(`  Srednia dzienna: ${avgSteps.toLocaleString()}`);
    lines.push(`  Suma: ${totalSteps.toLocaleString()}`);
    for (const d of stepsRes.value.steps.slice(-3)) {
      lines.push(`  ${d.date}: ${d.count.toLocaleString()}`);
    }
  }

  // Heart rate
  if (
    hrRes.status === "fulfilled" &&
    hrRes.value.ok &&
    hrRes.value.data?.length
  ) {
    lines.push(`\nTetno:`);
    for (const d of hrRes.value.data.slice(-3)) {
      lines.push(`  ${d.date}: avg ${d.avg} BPM (${d.min}-${d.max})`);
    }
  }

  // Sleep
  if (
    sleepRes.status === "fulfilled" &&
    sleepRes.value.ok &&
    sleepRes.value.sessions?.length
  ) {
    const sessions = sleepRes.value.sessions;
    const avgSleep =
      Math.round(
        (sessions.reduce((s, d) => s + d.durationHours, 0) / sessions.length) *
          10,
      ) / 10;
    lines.push(`\nSen:`);
    lines.push(`  Srednia: ${avgSleep}h`);
    for (const s of sessions.slice(-3)) {
      lines.push(`  ${s.date}: ${s.durationHours}h`);
    }
  }

  // Calories
  if (
    calRes.status === "fulfilled" &&
    calRes.value.ok &&
    calRes.value.calories?.length
  ) {
    const avgCal = Math.round(
      calRes.value.calories.reduce((s, d) => s + d.kcal, 0) /
        calRes.value.calories.length,
    );
    lines.push(`\nKalorie:`);
    lines.push(`  Srednia dzienna: ${avgCal} kcal`);
  }

  if (lines.length <= 1) {
    return {
      ok: false,
      error:
        "Brak danych zdrowotnych. Podłącz Oura Ring lub wprowadź dane ręcznie.",
    };
  }

  return { ok: true, summary: lines.join("\n") };
}
