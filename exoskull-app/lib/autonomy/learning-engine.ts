/**
 * Learning Engine
 *
 * Learns from intervention outcomes to optimize future behavior.
 * Feeds into MAPE-K Knowledge phase.
 *
 * Learns:
 * 1. Best communication channel per tenant
 * 2. Best time of day for contact
 * 3. Best message style (direct vs gentle)
 * 4. Which intervention types work
 * 5. Which goal strategies produce results
 */

import { createClient } from "@supabase/supabase-js";
import { getEffectivenessStats } from "./outcome-tracker";
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

export interface LearnedPreference {
  key: string;
  value: unknown;
  confidence: number;
  source: "feedback" | "behavior" | "explicit";
}

export interface LearningResult {
  preferences_updated: number;
  insights: string[];
}

// ============================================================================
// MAIN LEARNING CYCLE
// ============================================================================

/**
 * Run the learning engine for a tenant.
 * Analyzes outcome data and updates preferences.
 *
 * Called from: MAPE-K Knowledge phase, loop-daily
 */
export async function learnFromOutcomes(
  tenantId: string,
): Promise<LearningResult> {
  const result: LearningResult = {
    preferences_updated: 0,
    insights: [],
  };

  try {
    // 1. Get effectiveness stats
    const stats = await getEffectivenessStats(tenantId, 30);

    if (stats.length === 0) {
      return result; // Not enough data yet
    }

    // 2. Learn best intervention types
    const bestType = stats
      .filter((s) => s.sample_count >= 3)
      .sort((a, b) => b.avg_effectiveness - a.avg_effectiveness)[0];

    if (bestType) {
      await upsertPreference(
        tenantId,
        "best_intervention_type",
        bestType.intervention_type,
        Math.min(bestType.sample_count / 10, 0.95),
        "behavior",
      );
      result.preferences_updated++;
      result.insights.push(
        `Best intervention type: ${bestType.intervention_type} (${(bestType.avg_effectiveness * 100).toFixed(0)}% effective)`,
      );
    }

    // 3. Learn worst intervention types (to reduce)
    const worstType = stats
      .filter((s) => s.sample_count >= 3 && s.avg_effectiveness < 0.3)
      .sort((a, b) => a.avg_effectiveness - b.avg_effectiveness)[0];

    if (worstType) {
      await upsertPreference(
        tenantId,
        "worst_intervention_type",
        worstType.intervention_type,
        Math.min(worstType.sample_count / 10, 0.95),
        "behavior",
      );
      result.preferences_updated++;
      result.insights.push(
        `Reduce: ${worstType.intervention_type} (${(worstType.avg_effectiveness * 100).toFixed(0)}% effective, ${worstType.sample_count} samples)`,
      );
    }

    // 4. Learn response patterns (best hours)
    await learnBestContactHours(tenantId, result);

    // 5. Learn preferred channel
    await learnPreferredChannel(tenantId, result);

    // 6. Learn goal strategy patterns
    await learnGoalStrategyPatterns(tenantId, result);

    // 7. Learn triage classification accuracy (closed-loop feedback)
    await learnTriageAccuracy(tenantId, result);

    logger.info("[LearningEngine] Cycle complete:", {
      tenantId,
      ...result,
    });

    return result;
  } catch (error) {
    logger.error("[LearningEngine] Failed:", {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });
    return result;
  }
}

// ============================================================================
// SPECIFIC LEARNERS
// ============================================================================

async function learnBestContactHours(
  tenantId: string,
  result: LearningResult,
): Promise<void> {
  const supabase = getServiceSupabase();

  // Get successful outcomes with response times, grouped by hour
  const { data: outcomes } = await supabase
    .from("exo_intervention_outcomes")
    .select("effectiveness, response_time_minutes, created_at")
    .eq("tenant_id", tenantId)
    .eq("outcome_type", "user_response")
    .gte("effectiveness", 0.5)
    .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());

  if (!outcomes || outcomes.length < 5) return;

  // Group by hour
  const hourBuckets = new Map<
    number,
    { count: number; totalEffectiveness: number }
  >();
  for (const o of outcomes) {
    const hour = new Date(o.created_at).getHours();
    const bucket = hourBuckets.get(hour) || { count: 0, totalEffectiveness: 0 };
    bucket.count++;
    bucket.totalEffectiveness += o.effectiveness;
    hourBuckets.set(hour, bucket);
  }

  // Find best hour
  let bestHour = -1;
  let bestScore = 0;
  for (const [hour, bucket] of hourBuckets) {
    if (bucket.count >= 2) {
      const score = bucket.totalEffectiveness / bucket.count;
      if (score > bestScore) {
        bestScore = score;
        bestHour = hour;
      }
    }
  }

  if (bestHour >= 0) {
    await upsertPreference(
      tenantId,
      "best_contact_hour",
      bestHour,
      Math.min(outcomes.length / 20, 0.9),
      "behavior",
    );
    result.preferences_updated++;
    result.insights.push(`Best contact hour: ${bestHour}:00`);
  }
}

async function learnPreferredChannel(
  tenantId: string,
  result: LearningResult,
): Promise<void> {
  const supabase = getServiceSupabase();

  // Get proactive log to see which channels get responses
  const { data: logs } = await supabase
    .from("exo_proactive_log")
    .select("channel, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());

  if (!logs || logs.length < 5) return;

  // Count per channel
  const channelCounts = new Map<string, number>();
  for (const log of logs) {
    const ch = log.channel || "sms";
    channelCounts.set(ch, (channelCounts.get(ch) || 0) + 1);
  }

  // Most-used channel (correlates with response)
  let bestChannel = "sms";
  let bestCount = 0;
  for (const [ch, count] of channelCounts) {
    if (count > bestCount) {
      bestCount = count;
      bestChannel = ch;
    }
  }

  await upsertPreference(
    tenantId,
    "preferred_channel",
    bestChannel,
    Math.min(logs.length / 20, 0.85),
    "behavior",
  );
  result.preferences_updated++;
  result.insights.push(`Preferred channel: ${bestChannel}`);
}

/**
 * Learn which strategy step types work best per goal category.
 * Analyzes completed/abandoned strategies to find patterns.
 */
async function learnGoalStrategyPatterns(
  tenantId: string,
  result: LearningResult,
): Promise<void> {
  const supabase = getServiceSupabase();

  // Get strategies from last 60 days
  const { data: strategies } = await supabase
    .from("exo_goal_strategies")
    .select("goal_id, status, steps, confidence")
    .eq("tenant_id", tenantId)
    .gte("created_at", new Date(Date.now() - 60 * 86400000).toISOString());

  if (!strategies || strategies.length < 3) return;

  // Get goal categories for each strategy
  const goalIds = [...new Set(strategies.map((s) => s.goal_id))];
  const { data: goals } = await supabase
    .from("exo_user_goals")
    .select("id, category")
    .in("id", goalIds);

  if (!goals) return;

  const goalCategoryMap = new Map(goals.map((g) => [g.id, g.category]));

  // Analyze which step types correlate with successful strategies
  const stepTypeStats = new Map<
    string,
    { completed: number; failed: number; category: string }
  >();

  for (const strategy of strategies) {
    const category = goalCategoryMap.get(strategy.goal_id) || "unknown";
    const steps =
      (strategy.steps as Array<{ type: string; status: string }>) || [];

    for (const step of steps) {
      const key = `${category}:${step.type}`;
      const stats = stepTypeStats.get(key) || {
        completed: 0,
        failed: 0,
        category,
      };
      if (step.status === "completed") stats.completed++;
      else if (step.status === "failed") stats.failed++;
      stepTypeStats.set(key, stats);
    }
  }

  // Find best step type per category
  const bestByCategory = new Map<
    string,
    { type: string; successRate: number }
  >();
  for (const [key, stats] of stepTypeStats) {
    const total = stats.completed + stats.failed;
    if (total < 2) continue;
    const successRate = stats.completed / total;
    const [category, stepType] = key.split(":");

    const current = bestByCategory.get(category);
    if (!current || successRate > current.successRate) {
      bestByCategory.set(category, { type: stepType, successRate });
    }
  }

  // Store best step types as preferences
  for (const [category, best] of bestByCategory) {
    if (best.successRate >= 0.5) {
      await upsertPreference(
        tenantId,
        `best_goal_step_type:${category}`,
        best.type,
        Math.min(best.successRate, 0.9),
        "behavior",
      );
      result.preferences_updated++;
      result.insights.push(
        `Best step type for ${category} goals: ${best.type} (${Math.round(best.successRate * 100)}% success)`,
      );
    }
  }
}

/**
 * Learn from triage classification accuracy.
 * Analyzes which signal types the user acts on vs dismisses,
 * to improve future classification.
 */
async function learnTriageAccuracy(
  tenantId: string,
  result: LearningResult,
): Promise<void> {
  const supabase = getServiceSupabase();

  // Get triaged signals from last 30 days with their outcomes
  const { data: signals } = await supabase
    .from("exo_signal_triage")
    .select("signal_type, classification, proposed_action, user_action, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());

  if (!signals || signals.length < 10) return;

  // Calculate accuracy per signal type: did user follow the proposed action?
  const typeStats = new Map<
    string,
    { actedOn: number; dismissed: number; total: number }
  >();

  for (const sig of signals) {
    const key = `${sig.signal_type}:${sig.classification}`;
    const stats = typeStats.get(key) || { actedOn: 0, dismissed: 0, total: 0 };
    stats.total++;

    if (sig.user_action === "approved" || sig.user_action === "acted") {
      stats.actedOn++;
    } else if (
      sig.user_action === "dismissed" ||
      sig.user_action === "ignored"
    ) {
      stats.dismissed++;
    }

    typeStats.set(key, stats);
  }

  // Find classifications the user consistently ignores → mark as overclassified
  for (const [key, stats] of typeStats) {
    if (stats.total < 5) continue;

    const dismissRate = stats.dismissed / stats.total;
    const [signalType, classification] = key.split(":");

    if (dismissRate > 0.7 && classification !== "noise") {
      // This signal type is consistently ignored — it's probably noise
      await upsertPreference(
        tenantId,
        `triage_overclassified:${key}`,
        { signalType, classification, dismissRate, sampleCount: stats.total },
        Math.min(stats.total / 20, 0.85),
        "behavior",
      );
      result.preferences_updated++;
      result.insights.push(
        `Triage: ${signalType}/${classification} dismissed ${Math.round(dismissRate * 100)}% — consider downgrading`,
      );
    }

    if (stats.actedOn / stats.total > 0.8 && classification === "routine") {
      // User consistently acts on "routine" items — they may be underclassified
      await upsertPreference(
        tenantId,
        `triage_underclassified:${key}`,
        { signalType, classification, actRate: stats.actedOn / stats.total },
        Math.min(stats.total / 20, 0.85),
        "behavior",
      );
      result.preferences_updated++;
      result.insights.push(
        `Triage: ${signalType}/routine acted on ${Math.round((stats.actedOn / stats.total) * 100)}% — consider upgrading to important`,
      );
    }
  }
}

// ============================================================================
// PREFERENCE STORAGE
// ============================================================================

async function upsertPreference(
  tenantId: string,
  key: string,
  value: unknown,
  confidence: number,
  source: "feedback" | "behavior" | "explicit",
): Promise<void> {
  const supabase = getServiceSupabase();

  const { error } = await supabase.from("exo_tenant_preferences").upsert(
    {
      tenant_id: tenantId,
      preference_key: key,
      preference_value: JSON.stringify(value),
      confidence,
      learned_from: source,
      sample_count: 1, // Will increment on subsequent updates
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,preference_key" },
  );

  if (error) {
    logger.error("[LearningEngine] Preference upsert failed:", {
      tenantId,
      key,
      error: error.message,
    });
  }
}

/**
 * Get a learned preference for a tenant.
 * Returns null if not learned yet.
 */
export async function getPreference(
  tenantId: string,
  key: string,
): Promise<{ value: unknown; confidence: number } | null> {
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("exo_tenant_preferences")
    .select("preference_value, confidence")
    .eq("tenant_id", tenantId)
    .eq("preference_key", key)
    .single();

  if (!data) return null;

  try {
    return {
      value: JSON.parse(data.preference_value),
      confidence: data.confidence,
    };
  } catch {
    return { value: data.preference_value, confidence: data.confidence };
  }
}

/**
 * Get all learned preferences for a tenant.
 */
export async function getAllPreferences(
  tenantId: string,
): Promise<LearnedPreference[]> {
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("exo_tenant_preferences")
    .select("preference_key, preference_value, confidence, learned_from")
    .eq("tenant_id", tenantId);

  if (!data) return [];

  return data.map((row) => ({
    key: row.preference_key,
    value: (() => {
      try {
        return JSON.parse(row.preference_value);
      } catch {
        return row.preference_value;
      }
    })(),
    confidence: row.confidence,
    source: row.learned_from as "feedback" | "behavior" | "explicit",
  }));
}
