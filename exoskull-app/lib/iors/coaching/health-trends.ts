/**
 * Health Trend Analyzer
 *
 * Compares recent 5-day averages against prior 5-day averages
 * for key health metrics. Returns trend direction + significance.
 * No AI calls — pure math.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

export interface HealthTrend {
  metric: string;
  recentAvg: number;
  priorAvg: number;
  direction: "improving" | "declining" | "stable";
  changePct: number;
  significant: boolean;
}

export interface HealthTrendsResult {
  trends: HealthTrend[];
  alerts: string[];
  summary: string;
}

/**
 * Analyze 5 health metrics over a 10-day window (recent 5d vs prior 5d).
 */
export async function analyzeHealthTrends(
  tenantId: string,
): Promise<HealthTrendsResult> {
  const supabase = getServiceSupabase();
  const now = new Date();
  const fiveDaysAgo = new Date(now.getTime() - 5 * 86_400_000);
  const tenDaysAgo = new Date(now.getTime() - 10 * 86_400_000);

  const [sleepResult, healthResult] = await Promise.allSettled([
    supabase
      .from("exo_sleep_entries")
      .select("quality_score, hrv_average, duration_minutes, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", tenDaysAgo.toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("gold_daily_health_summary")
      .select(
        "date, steps_total, heart_rate_avg, active_minutes, sleep_minutes",
      )
      .eq("tenant_id", tenantId)
      .gte("date", tenDaysAgo.toISOString().slice(0, 10))
      .order("date", { ascending: false }),
  ]);

  const sleepEntries =
    sleepResult.status === "fulfilled" ? (sleepResult.value.data ?? []) : [];
  const healthRows =
    healthResult.status === "fulfilled" ? (healthResult.value.data ?? []) : [];

  const fiveDaysAgoStr = fiveDaysAgo.toISOString();

  // Split sleep entries into recent (last 5d) and prior (5-10d ago)
  const recentSleep = sleepEntries.filter(
    (e: { created_at: string }) => e.created_at >= fiveDaysAgoStr,
  );
  const priorSleep = sleepEntries.filter(
    (e: { created_at: string }) => e.created_at < fiveDaysAgoStr,
  );

  const fiveDaysAgoDate = fiveDaysAgo.toISOString().slice(0, 10);
  const recentHealth = healthRows.filter(
    (r: { date: string }) => r.date >= fiveDaysAgoDate,
  );
  const priorHealth = healthRows.filter(
    (r: { date: string }) => r.date < fiveDaysAgoDate,
  );

  const trends: HealthTrend[] = [];

  // 1. Sleep quality
  addTrend(
    trends,
    "sleep_quality",
    avg(recentSleep, "quality_score"),
    avg(priorSleep, "quality_score"),
    10,
  );

  // 2. HRV
  addTrend(
    trends,
    "hrv",
    avg(recentSleep, "hrv_average"),
    avg(priorSleep, "hrv_average"),
    10,
  );

  // 3. Sleep duration
  addTrend(
    trends,
    "sleep_duration",
    avg(recentSleep, "duration_minutes"),
    avg(priorSleep, "duration_minutes"),
    10,
  );

  // 4. Steps
  addTrend(
    trends,
    "steps",
    avg(recentHealth, "steps_total"),
    avg(priorHealth, "steps_total"),
    15,
  );

  // 5. Active minutes
  addTrend(
    trends,
    "active_minutes",
    avg(recentHealth, "active_minutes"),
    avg(priorHealth, "active_minutes"),
    15,
  );

  // Generate alerts for significant declines
  const alerts: string[] = [];
  for (const t of trends) {
    if (t.significant && t.direction === "declining") {
      alerts.push(formatAlert(t));
    }
  }

  const improving = trends.filter(
    (t) => t.significant && t.direction === "improving",
  );
  const declining = trends.filter(
    (t) => t.significant && t.direction === "declining",
  );

  let summary = "";
  if (declining.length > 0) {
    summary += `Spadki: ${declining.map((t) => METRIC_LABELS[t.metric]).join(", ")}. `;
  }
  if (improving.length > 0) {
    summary += `Poprawa: ${improving.map((t) => METRIC_LABELS[t.metric]).join(", ")}. `;
  }
  if (declining.length === 0 && improving.length === 0) {
    summary = "Brak istotnych zmian w zdrowiu w ostatnich 10 dniach.";
  }

  logger.info("[HealthTrends] Analyzed", {
    tenantId,
    trendCount: trends.length,
    alertCount: alerts.length,
  });

  return { trends, alerts, summary };
}

// ── Helpers ──

const METRIC_LABELS: Record<string, string> = {
  sleep_quality: "jakosc snu",
  hrv: "HRV",
  sleep_duration: "dlugosc snu",
  steps: "kroki",
  active_minutes: "aktywne minuty",
};

function avg(rows: Record<string, unknown>[], key: string): number | null {
  const values = rows
    .map((r) => Number(r[key]))
    .filter((v) => !isNaN(v) && v > 0);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function addTrend(
  trends: HealthTrend[],
  metric: string,
  recentAvg: number | null,
  priorAvg: number | null,
  significanceThresholdPct: number,
): void {
  if (recentAvg === null || priorAvg === null || priorAvg === 0) return;

  const changePct = ((recentAvg - priorAvg) / priorAvg) * 100;
  const significant = Math.abs(changePct) >= significanceThresholdPct;
  const direction: HealthTrend["direction"] =
    changePct > significanceThresholdPct
      ? "improving"
      : changePct < -significanceThresholdPct
        ? "declining"
        : "stable";

  trends.push({
    metric,
    recentAvg: Math.round(recentAvg * 10) / 10,
    priorAvg: Math.round(priorAvg * 10) / 10,
    direction,
    changePct: Math.round(changePct * 10) / 10,
    significant,
  });
}

function formatAlert(t: HealthTrend): string {
  const label = METRIC_LABELS[t.metric] ?? t.metric;
  return `${label}: ${t.priorAvg} → ${t.recentAvg} (${t.changePct > 0 ? "+" : ""}${t.changePct}%)`;
}
