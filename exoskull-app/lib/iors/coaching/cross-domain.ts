/**
 * Cross-Domain Insight Generator
 *
 * Detects correlations between different life domains:
 * sleep↔productivity, activity↔mood, engagement↔goals, etc.
 * Pure heuristics — no AI calls.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { getTasks } from "@/lib/tasks/task-service";

export interface CrossDomainInsight {
  domains: [string, string];
  correlation: "positive" | "negative" | "none";
  description: string;
  confidence: number; // 0-1
  dataPoints: number;
}

export interface CrossDomainResult {
  insights: CrossDomainInsight[];
  topInsight: string | null;
}

/**
 * Analyze cross-domain correlations from last 14 days of data.
 * Runs in loop-daily (once per 24h).
 */
export async function analyzeCrossDomain(
  tenantId: string,
): Promise<CrossDomainResult> {
  const supabase = getServiceSupabase();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const [sleepResult, healthResult, taskResult, msgResult, feedbackResult] =
    await Promise.allSettled([
      supabase
        .from("exo_sleep_entries")
        .select("quality_score, duration_minutes, hrv_average, created_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", fourteenDaysAgo)
        .order("created_at", { ascending: true }),
      supabase
        .from("gold_daily_health_summary")
        .select("date, steps_total, active_minutes")
        .eq("tenant_id", tenantId)
        .gte("date", fourteenDaysAgo.slice(0, 10))
        .order("date", { ascending: true }),
      // Tasks completed per day — via task-service
      getTasks(tenantId, { status: "done" }, supabase).then((tasks) => ({
        data: tasks
          .filter((t) => t.completed_at && t.completed_at >= fourteenDaysAgo)
          .map((t) => ({ completed_at: t.completed_at })),
        error: null,
      })),
      // Messages per day (engagement proxy)
      supabase
        .from("exo_unified_messages")
        .select("created_at")
        .eq("tenant_id", tenantId)
        .eq("role", "user")
        .gte("created_at", fourteenDaysAgo),
      // Feedback ratings
      supabase
        .from("exo_feedback")
        .select("rating, created_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", fourteenDaysAgo),
    ]);

  const sleepData =
    sleepResult.status === "fulfilled" ? (sleepResult.value.data ?? []) : [];
  const healthData =
    healthResult.status === "fulfilled" ? (healthResult.value.data ?? []) : [];
  const taskData =
    taskResult.status === "fulfilled" ? (taskResult.value.data ?? []) : [];
  const msgData =
    msgResult.status === "fulfilled" ? (msgResult.value.data ?? []) : [];
  const feedbackData =
    feedbackResult.status === "fulfilled"
      ? (feedbackResult.value.data ?? [])
      : [];

  const insights: CrossDomainInsight[] = [];

  // 1. Sleep quality → Task completion
  const sleepByDay = groupByDay(
    sleepData as Array<{ quality_score: number; created_at: string }>,
    "created_at",
    "quality_score",
  );
  const tasksByDay = countByDay(
    taskData as Array<{ completed_at: string }>,
    "completed_at",
  );
  addCorrelation(insights, "sleep", "productivity", sleepByDay, tasksByDay);

  // 2. Sleep duration → Engagement
  const sleepDurByDay = groupByDay(
    sleepData as Array<{ duration_minutes: number; created_at: string }>,
    "created_at",
    "duration_minutes",
  );
  const msgsByDay = countByDay(
    msgData as Array<{ created_at: string }>,
    "created_at",
  );
  addCorrelation(
    insights,
    "sleep_duration",
    "engagement",
    sleepDurByDay,
    msgsByDay,
  );

  // 3. Activity → Sleep quality (shifted by 1 day: today's activity → tonight's sleep)
  const activityByDay = groupByDay(
    healthData as Array<{ active_minutes: number; date: string }>,
    "date",
    "active_minutes",
  );
  addCorrelation(insights, "activity", "sleep", activityByDay, sleepByDay, 1);

  // 4. Steps → Satisfaction
  const stepsByDay = groupByDay(
    healthData as Array<{ steps_total: number; date: string }>,
    "date",
    "steps_total",
  );
  const satisfactionByDay = groupByDay(
    feedbackData as Array<{ rating: number; created_at: string }>,
    "created_at",
    "rating",
  );
  addCorrelation(
    insights,
    "steps",
    "satisfaction",
    stepsByDay,
    satisfactionByDay,
  );

  // Filter to significant correlations only
  const significantInsights = insights.filter((i) => i.confidence >= 0.5);
  significantInsights.sort((a, b) => b.confidence - a.confidence);

  const topInsight =
    significantInsights.length > 0 ? significantInsights[0].description : null;

  logger.info("[CrossDomain] Analyzed", {
    tenantId,
    totalPairs: insights.length,
    significant: significantInsights.length,
  });

  return { insights: significantInsights, topInsight };
}

// ── Helpers ──

type DayMap = Map<string, number>;

function groupByDay(
  rows: Array<Record<string, unknown>>,
  dateKey: string,
  valueKey: string,
): DayMap {
  const map = new Map<string, number[]>();
  for (const row of rows) {
    const dateStr = String(row[dateKey] ?? "").slice(0, 10);
    if (!dateStr) continue;
    const val = Number(row[valueKey]);
    if (isNaN(val)) continue;
    const arr = map.get(dateStr) ?? [];
    arr.push(val);
    map.set(dateStr, arr);
  }
  const result = new Map<string, number>();
  for (const [day, vals] of map) {
    result.set(day, vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return result;
}

function countByDay(
  rows: Array<Record<string, unknown>>,
  dateKey: string,
): DayMap {
  const map = new Map<string, number>();
  for (const row of rows) {
    const dateStr = String(row[dateKey] ?? "").slice(0, 10);
    if (!dateStr) continue;
    map.set(dateStr, (map.get(dateStr) ?? 0) + 1);
  }
  return map;
}

const DOMAIN_LABELS: Record<string, string> = {
  sleep: "jakosc snu",
  sleep_duration: "dlugosc snu",
  productivity: "produktywnosc (taski)",
  engagement: "zaangazowanie",
  activity: "aktywnosc fizyczna",
  steps: "kroki",
  satisfaction: "satysfakcja",
};

function addCorrelation(
  insights: CrossDomainInsight[],
  domainA: string,
  domainB: string,
  mapA: DayMap,
  mapB: DayMap,
  dayShift = 0,
): void {
  // Find overlapping days
  const pairs: Array<[number, number]> = [];
  for (const [day, valA] of mapA) {
    const targetDay =
      dayShift === 0
        ? day
        : new Date(new Date(day).getTime() + dayShift * 86_400_000)
            .toISOString()
            .slice(0, 10);
    const valB = mapB.get(targetDay);
    if (valB !== undefined) {
      pairs.push([valA, valB]);
    }
  }

  if (pairs.length < 4) return; // Need at least 4 data points

  const r = pearsonCorrelation(pairs);
  if (r === null) return;

  const absR = Math.abs(r);
  const correlation: CrossDomainInsight["correlation"] =
    absR < 0.3 ? "none" : r > 0 ? "positive" : "negative";

  if (correlation === "none") return;

  const labelA = DOMAIN_LABELS[domainA] ?? domainA;
  const labelB = DOMAIN_LABELS[domainB] ?? domainB;
  const dir = r > 0 ? "lepsze" : "gorsze";

  insights.push({
    domains: [domainA, domainB],
    correlation,
    description: `Gdy ${labelA} rosnie, ${labelB} jest ${dir} (r=${r.toFixed(2)}, ${pairs.length} dni)`,
    confidence: absR,
    dataPoints: pairs.length,
  });
}

function pearsonCorrelation(pairs: Array<[number, number]>): number | null {
  const n = pairs.length;
  if (n < 3) return null;

  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0,
    sumY2 = 0;
  for (const [x, y] of pairs) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  const denom = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY),
  );
  if (denom === 0) return null;

  return (n * sumXY - sumX * sumY) / denom;
}
