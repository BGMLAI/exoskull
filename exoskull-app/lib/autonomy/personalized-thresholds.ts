/**
 * Personalized Thresholds
 *
 * Replaces hardcoded thresholds in MAPE-K analyze with per-user adaptive values.
 *
 * Sources (priority order):
 * 1. Goal target: If user has goal "Sleep 8h/night" → threshold = 7h
 * 2. Personal baseline: 30-day average for this user (percentile-based)
 * 3. Population default: Hardcoded fallback (original values)
 */

import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ============================================================================
// TYPES
// ============================================================================

interface ThresholdConfig {
  value: number;
  source: "goal_target" | "personal_baseline" | "population_default";
  confidence: number; // 0-1
}

interface PersonalizedThresholds {
  minSleepHours: ThresholdConfig;
  criticalSleepHours: ThresholdConfig;
  maxOverdueTasks: ThresholdConfig;
  criticalOverdueTasks: ThresholdConfig;
  minActivityMinutes: ThresholdConfig;
  maxInactiveDays: ThresholdConfig;
  negativeEmotionThreshold: ThresholdConfig;
  negativeEmotionCount: ThresholdConfig;
}

// ============================================================================
// DEFAULTS (same as original hardcoded values)
// ============================================================================

const POPULATION_DEFAULTS: PersonalizedThresholds = {
  minSleepHours: { value: 6, source: "population_default", confidence: 0.5 },
  criticalSleepHours: {
    value: 5,
    source: "population_default",
    confidence: 0.5,
  },
  maxOverdueTasks: { value: 5, source: "population_default", confidence: 0.5 },
  criticalOverdueTasks: {
    value: 10,
    source: "population_default",
    confidence: 0.5,
  },
  minActivityMinutes: {
    value: 30,
    source: "population_default",
    confidence: 0.5,
  },
  maxInactiveDays: { value: 3, source: "population_default", confidence: 0.5 },
  negativeEmotionThreshold: {
    value: -0.3,
    source: "population_default",
    confidence: 0.5,
  },
  negativeEmotionCount: {
    value: 3,
    source: "population_default",
    confidence: 0.5,
  },
};

// ============================================================================
// MAIN FUNCTION
// ============================================================================

// Simple in-memory cache: tenantId → { thresholds, cachedAt }
const thresholdCache = new Map<
  string,
  { thresholds: PersonalizedThresholds; cachedAt: number }
>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Get personalized thresholds for a tenant.
 * Uses goal targets, personal baselines, and population defaults.
 */
export async function getPersonalizedThresholds(
  tenantId: string,
): Promise<PersonalizedThresholds> {
  // Check cache
  const cached = thresholdCache.get(tenantId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.thresholds;
  }

  const thresholds = { ...POPULATION_DEFAULTS };

  try {
    const supabase = getServiceSupabase();

    // Fetch goal-based thresholds and personal baselines in parallel
    const [goalThresholds, personalBaselines] = await Promise.all([
      deriveFromGoals(supabase, tenantId),
      deriveFromBaselines(supabase, tenantId),
    ]);

    // Apply goal-based thresholds (highest priority)
    if (goalThresholds.sleepHours !== null) {
      // If goal is "sleep 8h", threshold = goal - 1h (warning zone)
      thresholds.minSleepHours = {
        value: goalThresholds.sleepHours - 1,
        source: "goal_target",
        confidence: 0.9,
      };
      thresholds.criticalSleepHours = {
        value: goalThresholds.sleepHours - 2,
        source: "goal_target",
        confidence: 0.9,
      };
    }

    if (goalThresholds.activityMinutes !== null) {
      thresholds.minActivityMinutes = {
        value: Math.max(10, goalThresholds.activityMinutes * 0.5),
        source: "goal_target",
        confidence: 0.9,
      };
    }

    // Apply personal baselines (second priority, only if no goal overrides)
    if (
      personalBaselines.avgSleepHours !== null &&
      thresholds.minSleepHours.source === "population_default"
    ) {
      // Personal threshold = 80% of their average (warn when significantly below normal)
      thresholds.minSleepHours = {
        value:
          Math.round(Math.max(4, personalBaselines.avgSleepHours * 0.8) * 10) /
          10,
        source: "personal_baseline",
        confidence: Math.min(personalBaselines.sleepSampleCount / 14, 0.85),
      };
      thresholds.criticalSleepHours = {
        value:
          Math.round(
            Math.max(3.5, personalBaselines.avgSleepHours * 0.65) * 10,
          ) / 10,
        source: "personal_baseline",
        confidence: Math.min(personalBaselines.sleepSampleCount / 14, 0.85),
      };
    }

    if (
      personalBaselines.avgActivityMinutes !== null &&
      thresholds.minActivityMinutes.source === "population_default"
    ) {
      thresholds.minActivityMinutes = {
        value: Math.round(
          Math.max(10, personalBaselines.avgActivityMinutes * 0.5),
        ),
        source: "personal_baseline",
        confidence: Math.min(
          personalBaselines.activitySampleCount / 14,
          0.85,
        ),
      };
    }

    if (personalBaselines.avgOverdueTasks !== null) {
      // If user typically has 2 overdue, threshold = 2x their normal
      const normalOverdue = personalBaselines.avgOverdueTasks;
      if (
        normalOverdue > 0 &&
        thresholds.maxOverdueTasks.source === "population_default"
      ) {
        thresholds.maxOverdueTasks = {
          value: Math.round(Math.max(3, normalOverdue * 2)),
          source: "personal_baseline",
          confidence: 0.7,
        };
        thresholds.criticalOverdueTasks = {
          value: Math.round(Math.max(5, normalOverdue * 3)),
          source: "personal_baseline",
          confidence: 0.7,
        };
      }
    }

    // Cache result
    thresholdCache.set(tenantId, {
      thresholds,
      cachedAt: Date.now(),
    });

    return thresholds;
  } catch (error) {
    logger.warn("[PersonalizedThresholds] Failed, using defaults:", {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });
    return POPULATION_DEFAULTS;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

interface GoalThresholds {
  sleepHours: number | null;
  activityMinutes: number | null;
}

async function deriveFromGoals(
  supabase: ReturnType<typeof getServiceSupabase>,
  tenantId: string,
): Promise<GoalThresholds> {
  const result: GoalThresholds = {
    sleepHours: null,
    activityMinutes: null,
  };

  const { data: goals } = await supabase
    .from("exo_user_goals")
    .select("name, category, target_value, target_unit")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .eq("category", "health");

  if (!goals) return result;

  for (const goal of goals) {
    const unit = (goal.target_unit || "").toLowerCase();
    const name = (goal.name || "").toLowerCase();

    if (
      (unit.includes("hour") ||
        unit.includes("godzin") ||
        name.includes("sleep") ||
        name.includes("sen") ||
        name.includes("śpi")) &&
      goal.target_value
    ) {
      result.sleepHours = goal.target_value;
    }

    if (
      (unit.includes("min") ||
        name.includes("aktyw") ||
        name.includes("exercise") ||
        name.includes("trening")) &&
      goal.target_value
    ) {
      result.activityMinutes = goal.target_value;
    }
  }

  return result;
}

interface PersonalBaselines {
  avgSleepHours: number | null;
  sleepSampleCount: number;
  avgActivityMinutes: number | null;
  activitySampleCount: number;
  avgOverdueTasks: number | null;
}

async function deriveFromBaselines(
  supabase: ReturnType<typeof getServiceSupabase>,
  tenantId: string,
): Promise<PersonalBaselines> {
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 86400000,
  ).toISOString();

  const [sleepResult, activityResult, taskResult] = await Promise.all([
    supabase
      .from("exo_sleep_entries")
      .select("duration_minutes")
      .eq("tenant_id", tenantId)
      .gte("sleep_date", thirtyDaysAgo.split("T")[0]),
    supabase
      .from("exo_activity_entries")
      .select("duration_minutes")
      .eq("tenant_id", tenantId)
      .gte("entry_date", thirtyDaysAgo.split("T")[0]),
    supabase
      .from("exo_goal_checkpoints")
      .select("value")
      .eq("tenant_id", tenantId)
      .eq("data_source", "auto_cron")
      .gte("checkpoint_date", thirtyDaysAgo.split("T")[0]),
  ]);

  const sleepEntries = sleepResult.data || [];
  const activityEntries = activityResult.data || [];

  return {
    avgSleepHours:
      sleepEntries.length >= 3
        ? sleepEntries.reduce(
            (sum, e) => sum + (e.duration_minutes || 0) / 60,
            0,
          ) / sleepEntries.length
        : null,
    sleepSampleCount: sleepEntries.length,
    avgActivityMinutes:
      activityEntries.length >= 3
        ? activityEntries.reduce(
            (sum, e) => sum + (e.duration_minutes || 0),
            0,
          ) / activityEntries.length
        : null,
    activitySampleCount: activityEntries.length,
    avgOverdueTasks: null, // Hard to compute historically, skip for now
  };
}
