/**
 * Health Prediction Models
 *
 * Statistical heuristics for predicting health outcomes from device data.
 * No ML training — threshold-based + moving averages + trend detection.
 */

import { createClient } from "@supabase/supabase-js";

// ============================================================================
// CONFIGURABLE THRESHOLDS
// ============================================================================

/** Minimum data points required for any prediction */
const MIN_DATA_POINTS = 5;

/** HRV drop percentage that signals illness risk */
const HRV_DROP_THRESHOLD = 0.15; // 15%

/** Default sleep target in minutes (8 hours) */
const SLEEP_TARGET_MINUTES = 480;

/** Sleep debt thresholds (accumulated minutes) */
const SLEEP_DEBT_MEDIUM = 120; // 2h
const SLEEP_DEBT_HIGH = 300; // 5h
const SLEEP_DEBT_CRITICAL = 480; // 8h

/** Burnout risk threshold */
const BURNOUT_THRESHOLD_MEDIUM = 0.5;
const BURNOUT_THRESHOLD_HIGH = 0.65;
const BURNOUT_THRESHOLD_CRITICAL = 0.8;

/** Fitness trajectory change percentage */
const FITNESS_DECLINE_THRESHOLD = 0.15; // 15% decline
const FITNESS_IMPROVEMENT_THRESHOLD = 0.15; // 15% improvement

/** Prediction validity window in hours */
const PREDICTION_EXPIRY_HOURS = 48;

// ============================================================================
// TYPES
// ============================================================================

export interface HealthDataPoint {
  date: string;
  hrv_avg?: number;
  sleep_minutes?: number;
  sleep_quality?: number; // 1-10 from exo_sleep_entries.quality_score
  resting_hr?: number;
  steps?: number;
  active_minutes?: number;
  heart_rate_avg?: number;
}

export type PredictionMetric =
  | "illness_risk"
  | "productivity_impact"
  | "burnout_risk"
  | "fitness_trajectory";

export interface Prediction {
  tenantId: string;
  metric: PredictionMetric;
  probability: number;
  confidence: number;
  severity: "low" | "medium" | "high" | "critical";
  message_pl: string;
  message_en: string;
  data_points: number;
  expires_at: Date;
  metadata: Record<string, unknown>;
}

// ============================================================================
// DATA LOADING
// ============================================================================

export async function loadHealthData(
  tenantId: string,
  days: number = 14,
): Promise<HealthDataPoint[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];

  // Query gold view for aggregated metrics
  const { data: goldData, error: goldError } = await supabase
    .from("gold_daily_health_summary")
    .select(
      "date, hrv_avg, sleep_minutes, steps_total, active_minutes, heart_rate_avg",
    )
    .eq("tenant_id", tenantId)
    .gte("date", sinceStr)
    .order("date", { ascending: true });

  if (goldError) {
    console.error("[HealthModels] Gold query failed:", {
      tenantId,
      error: goldError.message,
    });
    return [];
  }

  // Query sleep entries for richer data (resting HR, quality)
  const { data: sleepData, error: sleepError } = await supabase
    .from("exo_sleep_entries")
    .select("sleep_start, quality_score, resting_hr")
    .eq("tenant_id", tenantId)
    .gte("sleep_start", since.toISOString())
    .order("sleep_start", { ascending: true });

  if (sleepError) {
    console.error("[HealthModels] Sleep query failed:", {
      tenantId,
      error: sleepError.message,
    });
    // Continue without sleep entries — gold data is sufficient for some models
  }

  // Build date-keyed sleep lookup
  const sleepByDate = new Map<
    string,
    { quality_score?: number; resting_hr?: number }
  >();
  if (sleepData) {
    for (const s of sleepData) {
      const dateKey = new Date(s.sleep_start).toISOString().split("T")[0];
      // Keep latest entry per date
      sleepByDate.set(dateKey, {
        quality_score: s.quality_score ?? undefined,
        resting_hr: s.resting_hr ?? undefined,
      });
    }
  }

  // Merge gold + sleep data
  const points: HealthDataPoint[] = (goldData || []).map((g) => {
    const sleep = sleepByDate.get(g.date);
    return {
      date: g.date,
      hrv_avg: g.hrv_avg ?? undefined,
      sleep_minutes: g.sleep_minutes ?? undefined,
      sleep_quality: sleep?.quality_score,
      resting_hr: sleep?.resting_hr,
      steps: g.steps_total ?? undefined,
      active_minutes: g.active_minutes ?? undefined,
      heart_rate_avg: g.heart_rate_avg ?? undefined,
    };
  });

  return points;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function expiresAt(): Date {
  return new Date(Date.now() + PREDICTION_EXPIRY_HOURS * 60 * 60 * 1000);
}

// ============================================================================
// MODEL 1: HRV TREND → ILLNESS RISK
// ============================================================================

export function predictIllnessRisk(
  tenantId: string,
  data: HealthDataPoint[],
): Prediction | null {
  const hrvValues = data
    .filter((d) => d.hrv_avg != null)
    .map((d) => ({ date: d.date, hrv: d.hrv_avg! }));

  if (hrvValues.length < MIN_DATA_POINTS) return null;

  // Baseline: average of all available HRV data
  const baseline = avg(hrvValues.map((v) => v.hrv));

  // Recent: average of last 5 days
  const recentSlice = hrvValues.slice(-5);
  const recentAvg = avg(recentSlice.map((v) => v.hrv));

  // Calculate drop percentage
  const dropPct = (baseline - recentAvg) / baseline;

  if (dropPct <= 0.05) return null; // No meaningful drop

  // Probability scales with drop severity
  const probability = Math.min(1, dropPct / 0.3); // 30% drop = 100% probability
  const confidence = Math.min(1, hrvValues.length / 14); // More data = higher confidence
  const severity =
    dropPct >= 0.25
      ? "critical"
      : dropPct >= HRV_DROP_THRESHOLD
        ? "high"
        : dropPct >= 0.1
          ? "medium"
          : "low";

  return {
    tenantId,
    metric: "illness_risk",
    probability,
    confidence,
    severity,
    message_pl: `Twoje HRV spadło o ${Math.round(dropPct * 100)}% w ciągu ostatnich 5 dni (${Math.round(recentAvg)} vs bazowe ${Math.round(baseline)}). To może sygnalizować nadchodzącą infekcję. Zadbaj o odpoczynek i nawodnienie.`,
    message_en: `Your HRV dropped ${Math.round(dropPct * 100)}% over the last 5 days (${Math.round(recentAvg)} vs baseline ${Math.round(baseline)}). This may signal an incoming illness. Prioritize rest and hydration.`,
    data_points: hrvValues.length,
    expires_at: expiresAt(),
    metadata: {
      baseline_hrv: Math.round(baseline),
      recent_hrv: Math.round(recentAvg),
      drop_pct: Math.round(dropPct * 100),
    },
  };
}

// ============================================================================
// MODEL 2: SLEEP DEBT → PRODUCTIVITY IMPACT
// ============================================================================

export function predictProductivityImpact(
  tenantId: string,
  data: HealthDataPoint[],
): Prediction | null {
  const sleepValues = data
    .filter((d) => d.sleep_minutes != null)
    .map((d) => ({ date: d.date, minutes: d.sleep_minutes! }));

  // Need at least 5 days of sleep data
  if (sleepValues.length < MIN_DATA_POINTS) return null;

  // Last 7 days for debt calculation
  const recent7 = sleepValues.slice(-7);

  // Calculate accumulated sleep debt
  const totalDebt = recent7.reduce(
    (debt, d) => debt + Math.max(0, SLEEP_TARGET_MINUTES - d.minutes),
    0,
  );

  if (totalDebt < 60) return null; // Less than 1h debt — no concern

  // Productivity impact estimation (linear model)
  // Every 60min of debt = ~8% productivity loss (research-backed heuristic)
  const impactPct = Math.min(60, (totalDebt / 60) * 8);
  const probability = Math.min(1, impactPct / 50); // 50% impact = 100% probability

  const confidence = Math.min(1, recent7.length / 7);
  const severity =
    totalDebt >= SLEEP_DEBT_CRITICAL
      ? "critical"
      : totalDebt >= SLEEP_DEBT_HIGH
        ? "high"
        : totalDebt >= SLEEP_DEBT_MEDIUM
          ? "medium"
          : "low";

  const avgSleepH =
    Math.round((avg(recent7.map((d) => d.minutes)) / 60) * 10) / 10;
  const debtH = Math.round((totalDebt / 60) * 10) / 10;

  return {
    tenantId,
    metric: "productivity_impact",
    probability,
    confidence,
    severity,
    message_pl: `Dług senny: ${debtH}h w ciągu 7 dni (średnio ${avgSleepH}h/noc vs cel 8h). Szacowany spadek produktywności: ~${Math.round(impactPct)}%. Priorytetyzuj sen w najbliższych nocach.`,
    message_en: `Sleep debt: ${debtH}h over 7 days (avg ${avgSleepH}h/night vs 8h target). Estimated productivity drop: ~${Math.round(impactPct)}%. Prioritize sleep in the coming nights.`,
    data_points: sleepValues.length,
    expires_at: expiresAt(),
    metadata: {
      total_debt_minutes: totalDebt,
      avg_sleep_minutes: Math.round(avg(recent7.map((d) => d.minutes))),
      impact_pct: Math.round(impactPct),
      days_analyzed: recent7.length,
    },
  };
}

// ============================================================================
// MODEL 3: COMPOUND STRESS → BURNOUT RISK
// ============================================================================

export function predictBurnoutRisk(
  tenantId: string,
  data: HealthDataPoint[],
): Prediction | null {
  // Need at least 5 days with mixed metrics
  if (data.length < MIN_DATA_POINTS) return null;

  const recent7 = data.slice(-7);

  // Sub-score 1: HRV decline (weight: 0.3)
  let hrvScore = 0;
  const hrvPoints = data
    .filter((d) => d.hrv_avg != null)
    .map((d) => d.hrv_avg!);
  if (hrvPoints.length >= 3) {
    const baseline = avg(hrvPoints);
    const recentHrv = avg(
      data
        .slice(-5)
        .filter((d) => d.hrv_avg != null)
        .map((d) => d.hrv_avg!),
    );
    const drop = (baseline - recentHrv) / baseline;
    hrvScore = Math.max(0, Math.min(1, drop / 0.2)); // 20% drop = score 1.0
  }

  // Sub-score 2: Elevated resting HR (weight: 0.2)
  let hrScore = 0;
  const hrPoints = recent7
    .filter((d) => d.resting_hr != null)
    .map((d) => d.resting_hr!);
  if (hrPoints.length >= 3) {
    const allHr = data
      .filter((d) => d.resting_hr != null)
      .map((d) => d.resting_hr!);
    const baseline = avg(allHr);
    const recentHr = avg(hrPoints);
    const rise = (recentHr - baseline) / baseline;
    hrScore = Math.max(0, Math.min(1, rise / 0.1)); // 10% rise = score 1.0
  }

  // Sub-score 3: Poor sleep (weight: 0.3)
  let sleepScore = 0;
  const sleepPoints = recent7
    .filter((d) => d.sleep_minutes != null)
    .map((d) => d.sleep_minutes!);
  if (sleepPoints.length >= 3) {
    const avgSleep = avg(sleepPoints);
    // Below 360 min (6h) = concerning
    sleepScore = Math.max(
      0,
      Math.min(1, (SLEEP_TARGET_MINUTES - avgSleep) / 120),
    );
  }

  // Sub-score 4: Low activity (weight: 0.2)
  let activityScore = 0;
  const stepPoints = recent7
    .filter((d) => d.steps != null)
    .map((d) => d.steps!);
  if (stepPoints.length >= 3) {
    const avgSteps = avg(stepPoints);
    // Below 3000 steps = very sedentary
    activityScore = Math.max(0, Math.min(1, (5000 - avgSteps) / 5000));
  }

  // Weighted compound score
  const burnoutScore =
    hrvScore * 0.3 + hrScore * 0.2 + sleepScore * 0.3 + activityScore * 0.2;

  if (burnoutScore < 0.3) return null; // Too low to report

  // Count how many sub-scores contributed
  const contributingFactors = [
    hrvScore,
    hrScore,
    sleepScore,
    activityScore,
  ].filter((s) => s > 0.1).length;
  const confidence = Math.min(1, contributingFactors / 3); // 3 out of 4 factors = full confidence

  const severity =
    burnoutScore >= BURNOUT_THRESHOLD_CRITICAL
      ? "critical"
      : burnoutScore >= BURNOUT_THRESHOLD_HIGH
        ? "high"
        : burnoutScore >= BURNOUT_THRESHOLD_MEDIUM
          ? "medium"
          : "low";

  const factors: string[] = [];
  const factorsPl: string[] = [];
  if (hrvScore > 0.3) {
    factors.push("declining HRV");
    factorsPl.push("spadające HRV");
  }
  if (hrScore > 0.3) {
    factors.push("elevated resting heart rate");
    factorsPl.push("podwyższone tętno spoczynkowe");
  }
  if (sleepScore > 0.3) {
    factors.push("insufficient sleep");
    factorsPl.push("niedobór snu");
  }
  if (activityScore > 0.3) {
    factors.push("low physical activity");
    factorsPl.push("niska aktywność fizyczna");
  }

  return {
    tenantId,
    metric: "burnout_risk",
    probability: burnoutScore,
    confidence,
    severity,
    message_pl: `Wykryto ryzyko wypalenia (${Math.round(burnoutScore * 100)}%). Czynniki: ${factorsPl.join(", ")}. Rozważ dzień odpoczynku lub zmniejszenie obciążeń.`,
    message_en: `Burnout risk detected (${Math.round(burnoutScore * 100)}%). Factors: ${factors.join(", ")}. Consider a rest day or reducing workload.`,
    data_points: data.length,
    expires_at: expiresAt(),
    metadata: {
      burnout_score: Math.round(burnoutScore * 100),
      sub_scores: {
        hrv: Math.round(hrvScore * 100),
        resting_hr: Math.round(hrScore * 100),
        sleep: Math.round(sleepScore * 100),
        activity: Math.round(activityScore * 100),
      },
      contributing_factors: factors,
    },
  };
}

// ============================================================================
// MODEL 4: ACTIVITY TREND → FITNESS TRAJECTORY
// ============================================================================

export function predictFitnessTrajectory(
  tenantId: string,
  data: HealthDataPoint[],
): Prediction | null {
  const stepValues = data
    .filter((d) => d.steps != null)
    .map((d) => ({ date: d.date, steps: d.steps! }));

  if (stepValues.length < MIN_DATA_POINTS) return null;

  // Baseline: full period average
  const baseline = avg(stepValues.map((v) => v.steps));
  if (baseline < 100) return null; // Not enough baseline activity

  // Recent: last 7 days
  const recent7 = stepValues.slice(-7);
  const recentAvg = avg(recent7.map((v) => v.steps));

  const changePct = (recentAvg - baseline) / baseline;

  // Only report meaningful changes
  if (Math.abs(changePct) < 0.1) return null;

  const improving = changePct > 0;
  const probability = Math.min(1, Math.abs(changePct) / 0.3);
  const confidence = Math.min(1, stepValues.length / 14);

  let severity: Prediction["severity"];
  if (improving) {
    severity = changePct >= 0.3 ? "low" : "low"; // Positive trends are never alarming
  } else {
    severity =
      Math.abs(changePct) >= 0.3
        ? "high"
        : Math.abs(changePct) >= FITNESS_DECLINE_THRESHOLD
          ? "medium"
          : "low";
  }

  const changeStr = improving ? "increase" : "decrease";
  const changeStrPl = improving ? "wzrost" : "spadek";
  const adviceEn = improving
    ? "Great momentum — keep it up!"
    : "Try to add a short walk or activity today.";
  const advicePl = improving
    ? "Świetna dynamika — tak trzymaj!"
    : "Spróbuj dodać krótki spacer lub aktywność dzisiaj.";

  return {
    tenantId,
    metric: "fitness_trajectory",
    probability,
    confidence,
    severity,
    message_pl: `Trend aktywności: ${changeStrPl} o ${Math.round(Math.abs(changePct) * 100)}% (${Math.round(recentAvg)} kroków/dzień vs bazowe ${Math.round(baseline)}). ${advicePl}`,
    message_en: `Activity trend: ${changeStr} of ${Math.round(Math.abs(changePct) * 100)}% (${Math.round(recentAvg)} steps/day vs baseline ${Math.round(baseline)}). ${adviceEn}`,
    data_points: stepValues.length,
    expires_at: expiresAt(),
    metadata: {
      baseline_steps: Math.round(baseline),
      recent_steps: Math.round(recentAvg),
      change_pct: Math.round(changePct * 100),
      direction: improving ? "improving" : "declining",
    },
  };
}
