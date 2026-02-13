/**
 * Google Fit Direct Adapter
 *
 * Bypasses Composio for Google Fit data - direct REST API access.
 * Composio had rate limit issues with Google Fit; this adapter gives reliable access.
 *
 * Requires: Google OAuth2 credentials with fitness.activity.read, fitness.body.read,
 *           fitness.sleep.read scopes.
 *
 * Data sources:
 * - Steps (daily, hourly)
 * - Heart rate (BPM)
 * - Sleep sessions
 * - Activity segments
 * - Weight, body fat
 * - Calories burned
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { ensureFreshToken } from "@/lib/rigs/oauth";

const GOOGLE_FIT_BASE = "https://www.googleapis.com/fitness/v1/users/me";

// ============================================================================
// TOKEN MANAGEMENT (unified via exo_rig_connections)
// ============================================================================

// Google Fit tokens are stored in exo_rig_connections with rig_slug
// matching one of: "google", "google-fit", "google-workspace"
// (all include fitness scopes)
const GOOGLE_RIG_SLUGS = ["google", "google-fit", "google-workspace"];

async function getValidToken(tenantId: string): Promise<string | null> {
  const supabase = getServiceSupabase();

  // Try each possible Google rig slug (unified google first)
  for (const slug of GOOGLE_RIG_SLUGS) {
    const { data: connection } = await supabase
      .from("exo_rig_connections")
      .select("id, rig_slug, access_token, refresh_token, expires_at")
      .eq("tenant_id", tenantId)
      .eq("rig_slug", slug)
      .maybeSingle();

    if (connection?.access_token) {
      try {
        // ensureFreshToken handles refresh if needed and updates DB
        return await ensureFreshToken(connection);
      } catch (err) {
        console.error(`[GoogleFit] Token refresh failed for ${slug}:`, err);
        continue; // Try next slug
      }
    }
  }

  return null;
}

// ============================================================================
// API HELPERS
// ============================================================================

async function fitFetch(
  tenantId: string,
  path: string,
  options?: RequestInit,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const token = await getValidToken(tenantId);
  if (!token) {
    return {
      ok: false,
      error: "No valid Google Fit token. Please reconnect Google Fit.",
    };
  }

  try {
    const res = await fetch(`${GOOGLE_FIT_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        ok: false,
        error: `Google Fit API error ${res.status}: ${errText}`,
      };
    }

    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: `Google Fit request failed: ${err instanceof Error ? err.message : err}`,
    };
  }
}

// ============================================================================
// DATA FETCHERS
// ============================================================================

/**
 * Get daily step count for a date range
 */
export async function getSteps(
  tenantId: string,
  startDate: Date,
  endDate: Date,
): Promise<{
  ok: boolean;
  steps?: Array<{ date: string; count: number }>;
  error?: string;
}> {
  const startTimeMillis = startDate.getTime();
  const endTimeMillis = endDate.getTime();

  const result = await fitFetch(tenantId, "/dataset:aggregate", {
    method: "POST",
    body: JSON.stringify({
      aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis,
      endTimeMillis,
    }),
  });

  if (!result.ok) return { ok: false, error: result.error };

  const buckets =
    (
      result.data as {
        bucket?: Array<{
          startTimeMillis: string;
          dataset: Array<{
            point: Array<{ value: Array<{ intVal: number }> }>;
          }>;
        }>;
      }
    )?.bucket || [];

  const steps = buckets.map((b) => ({
    date: new Date(parseInt(b.startTimeMillis)).toISOString().split("T")[0],
    count: b.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal || 0,
  }));

  return { ok: true, steps };
}

/**
 * Get heart rate data
 */
export async function getHeartRate(
  tenantId: string,
  startDate: Date,
  endDate: Date,
): Promise<{
  ok: boolean;
  data?: Array<{ date: string; avg: number; min: number; max: number }>;
  error?: string;
}> {
  const result = await fitFetch(tenantId, "/dataset:aggregate", {
    method: "POST",
    body: JSON.stringify({
      aggregateBy: [{ dataTypeName: "com.google.heart_rate.bpm" }],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: startDate.getTime(),
      endTimeMillis: endDate.getTime(),
    }),
  });

  if (!result.ok) return { ok: false, error: result.error };

  const buckets =
    (
      result.data as {
        bucket?: Array<{
          startTimeMillis: string;
          dataset: Array<{ point: Array<{ value: Array<{ fpVal: number }> }> }>;
        }>;
      }
    )?.bucket || [];

  const data = buckets
    .filter((b) => b.dataset?.[0]?.point?.length)
    .map((b) => {
      const points = b.dataset[0].point;
      const values = points.map((p) => p.value[0]?.fpVal || 0).filter(Boolean);
      return {
        date: new Date(parseInt(b.startTimeMillis)).toISOString().split("T")[0],
        avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
        min: Math.round(Math.min(...values)),
        max: Math.round(Math.max(...values)),
      };
    });

  return { ok: true, data };
}

/**
 * Get sleep sessions
 */
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
  const result = await fitFetch(
    tenantId,
    `/sessions?startTime=${startDate.toISOString()}&endTime=${endDate.toISOString()}&activityType=72`,
  );

  if (!result.ok) return { ok: false, error: result.error };

  const rawSessions =
    (
      result.data as {
        session?: Array<{ startTimeMillis: string; endTimeMillis: string }>;
      }
    )?.session || [];

  const sessions = rawSessions.map((s) => {
    const start = new Date(parseInt(s.startTimeMillis));
    const end = new Date(parseInt(s.endTimeMillis));
    const durationMs = end.getTime() - start.getTime();
    return {
      date: start.toISOString().split("T")[0],
      durationHours: Math.round((durationMs / 3600000) * 10) / 10,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    };
  });

  return { ok: true, sessions };
}

/**
 * Get calories burned
 */
export async function getCalories(
  tenantId: string,
  startDate: Date,
  endDate: Date,
): Promise<{
  ok: boolean;
  calories?: Array<{ date: string; kcal: number }>;
  error?: string;
}> {
  const result = await fitFetch(tenantId, "/dataset:aggregate", {
    method: "POST",
    body: JSON.stringify({
      aggregateBy: [{ dataTypeName: "com.google.calories.expended" }],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: startDate.getTime(),
      endTimeMillis: endDate.getTime(),
    }),
  });

  if (!result.ok) return { ok: false, error: result.error };

  const buckets =
    (
      result.data as {
        bucket?: Array<{
          startTimeMillis: string;
          dataset: Array<{ point: Array<{ value: Array<{ fpVal: number }> }> }>;
        }>;
      }
    )?.bucket || [];

  const calories = buckets.map((b) => ({
    date: new Date(parseInt(b.startTimeMillis)).toISOString().split("T")[0],
    kcal: Math.round(b.dataset?.[0]?.point?.[0]?.value?.[0]?.fpVal || 0),
  }));

  return { ok: true, calories };
}

/**
 * Get comprehensive health summary for a date range
 */
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
    stepsRes.value.steps
  ) {
    const avgSteps = Math.round(
      stepsRes.value.steps.reduce((s, d) => s + d.count, 0) /
        Math.max(stepsRes.value.steps.length, 1),
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
    const data = hrRes.value.data;
    lines.push(`\nTetno:`);
    for (const d of data.slice(-3)) {
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
    calRes.value.calories
  ) {
    const avgCal = Math.round(
      calRes.value.calories.reduce((s, d) => s + d.kcal, 0) /
        Math.max(calRes.value.calories.length, 1),
    );
    lines.push(`\nKalorie:`);
    lines.push(`  Srednia dzienna: ${avgCal} kcal`);
  }

  if (lines.length <= 1) {
    return {
      ok: false,
      error: "Nie udalo sie pobrac danych z Google Fit. Sprawdz polaczenie.",
    };
  }

  return { ok: true, summary: lines.join("\n") };
}
