/**
 * Knowledge Engine — Data Collector
 *
 * Aggregates data into a single TenantKnowledgeSnapshot.
 * Uses Gold materialized views for pre-aggregated metrics (health, conversations).
 * Falls back to raw tables for data not yet in the Data Lake.
 *
 * Data sources:
 * - Gold: exo_gold_daily_summary, exo_gold_messages_daily, gold_daily_health_summary
 * - Raw:  exo_daily_summaries, exo_predictions, exo_tasks, exo_goal_statuses,
 *         user_memory_highlights, user_patterns, user_mits, exo_interventions,
 *         exo_feedback, exo_emotion_log, exo_tenants
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { createHash } from "crypto";
import type { TenantKnowledgeSnapshot, TrendDirection } from "./types";

const WINDOW_DAYS = 30;

// ---- Gold layer row types ----

interface GoldDailySummaryRow {
  date: string;
  conversation_count: number;
  voice_count: number;
  sms_count: number;
  web_count: number;
  api_count: number;
}

interface GoldMessagesDailyRow {
  date: string;
  message_count: number;
  user_messages: number;
  assistant_messages: number;
}

interface GoldHealthDailyRow {
  date: string;
  sleep_minutes: number | null;
  hrv_avg: number | null;
  heart_rate_avg: number | null;
  steps_total: number | null;
  active_minutes: number | null;
}

/**
 * Collect a full knowledge snapshot for a tenant.
 * Uses Gold views where available, raw tables otherwise.
 */
export async function collectKnowledgeSnapshot(
  tenantId: string,
): Promise<TenantKnowledgeSnapshot> {
  const supabase = getServiceSupabase();
  const now = new Date();
  const windowStart = new Date(
    now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const windowStartDate = windowStart.slice(0, 10);
  const fourteenDaysAgo = new Date(
    now.getTime() - 14 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const threeDaysAgo = new Date(
    now.getTime() - 3 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const startTime = Date.now();

  const [
    // Gold layer queries
    goldDailySummaryResult,
    goldMessagesDailyResult,
    goldHealthDailyResult,
    // Raw queries (no Gold coverage)
    dailySummariesResult,
    predictionsResult,
    tasksCompletedResult,
    tasksPendingResult,
    tasksOverdueResult,
    tasksStalledResult,
    goalsResult,
    highlightsResult,
    patternsResult,
    mitsResult,
    interventionsResult,
    feedbackResult,
    emotionResult,
    tenantResult,
  ] = await Promise.allSettled([
    // ---- GOLD LAYER (pre-aggregated, <10ms each) ----

    // G1. Conversation summary (30d) — replaces raw exo_unified_messages scan
    supabase
      .from("exo_gold_daily_summary")
      .select(
        "date, conversation_count, voice_count, sms_count, web_count, api_count",
      )
      .eq("tenant_id", tenantId)
      .gte("date", windowStartDate)
      .order("date", { ascending: false }),

    // G2. Messages daily (30d) — message counts + user/assistant breakdown
    supabase
      .from("exo_gold_messages_daily")
      .select("date, message_count, user_messages, assistant_messages")
      .eq("tenant_id", tenantId)
      .gte("date", windowStartDate)
      .order("date", { ascending: false }),

    // G3. Health daily (30d) — replaces raw sleep + activity queries
    supabase
      .from("gold_daily_health_summary")
      .select(
        "date, sleep_minutes, hrv_avg, heart_rate_avg, steps_total, active_minutes",
      )
      .eq("tenant_id", tenantId)
      .gte("date", windowStartDate)
      .order("date", { ascending: false }),

    // ---- RAW QUERIES (no Gold coverage) ----

    // R1. Daily summaries (30d) — topics, mood (not in Gold)
    supabase
      .from("exo_daily_summaries")
      .select("key_topics, mood_score, energy_score, summary_date")
      .eq("tenant_id", tenantId)
      .gte("summary_date", windowStartDate)
      .order("summary_date", { ascending: false }),

    // R2. Active predictions
    supabase
      .from("exo_predictions")
      .select("metric, probability, severity")
      .eq("tenant_id", tenantId)
      .is("delivered_at", null)
      .gt("expires_at", now.toISOString()),

    // R3. Tasks completed (30d)
    supabase
      .from("exo_tasks")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "done")
      .gte("completed_at", windowStart),

    // R4. Tasks pending
    supabase
      .from("exo_tasks")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending"),

    // R5. Tasks overdue
    supabase
      .from("exo_tasks")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .lt("due_date", now.toISOString()),

    // R6. Tasks stalled (pending > 3d)
    supabase
      .from("exo_tasks")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .lt("created_at", threeDaysAgo),

    // R7. Goal statuses
    supabase
      .from("exo_goal_statuses")
      .select(
        "trajectory, progress_percent, days_remaining, goal:exo_goals(name)",
      )
      .eq("tenant_id", tenantId),

    // R8. Top highlights
    supabase
      .from("user_memory_highlights")
      .select("category, content, importance")
      .eq("user_id", tenantId)
      .order("importance", { ascending: false })
      .limit(20),

    // R9. Active patterns
    supabase
      .from("user_patterns")
      .select("pattern_type, description, confidence")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("confidence", { ascending: false })
      .limit(10),

    // R10. MITs
    supabase
      .from("user_mits")
      .select("rank, objective, score")
      .eq("tenant_id", tenantId)
      .order("rank", { ascending: true }),

    // R11. Interventions (30d) — success rate
    supabase
      .from("exo_interventions")
      .select("status, user_feedback")
      .eq("tenant_id", tenantId)
      .gte("created_at", windowStart),

    // R12. Feedback (30d)
    supabase
      .from("exo_feedback")
      .select("rating")
      .eq("tenant_id", tenantId)
      .gte("created_at", windowStart),

    // R13. Emotion log (14d)
    supabase
      .from("exo_emotion_log")
      .select("valence, arousal, primary_emotion")
      .eq("tenant_id", tenantId)
      .gte("created_at", fourteenDaysAgo)
      .order("created_at", { ascending: false }),

    // R14. Tenant config
    supabase
      .from("exo_tenants")
      .select("iors_personality")
      .eq("id", tenantId)
      .single(),
  ]);

  // ============================================================================
  // EXTRACT & COMPUTE — Gold Layer
  // ============================================================================

  // -- Conversations (from Gold daily summary + messages daily) --
  const goldDaily = extract(
    goldDailySummaryResult,
    [],
  ) as GoldDailySummaryRow[];
  const goldMessages = extract(
    goldMessagesDailyResult,
    [],
  ) as GoldMessagesDailyRow[];
  const hasGoldData = goldDaily.length > 0 || goldMessages.length > 0;

  const totalMessages = goldMessages.reduce(
    (sum, d) => sum + (d.message_count || 0),
    0,
  );
  const totalUserMessages = goldMessages.reduce(
    (sum, d) => sum + (d.user_messages || 0),
    0,
  );
  const avgPerDay =
    goldMessages.length > 0 ? totalMessages / goldMessages.length : 0;
  const userMessagesPct =
    totalMessages > 0 ? totalUserMessages / totalMessages : 0;

  // Channel breakdown from Gold daily summary
  const channelBreakdown: Record<string, number> = {};
  for (const d of goldDaily) {
    if (d.voice_count > 0)
      channelBreakdown.voice = (channelBreakdown.voice || 0) + d.voice_count;
    if (d.sms_count > 0)
      channelBreakdown.sms = (channelBreakdown.sms || 0) + d.sms_count;
    if (d.web_count > 0)
      channelBreakdown.web_chat =
        (channelBreakdown.web_chat || 0) + d.web_count;
    if (d.api_count > 0)
      channelBreakdown.api = (channelBreakdown.api || 0) + d.api_count;
  }

  // Engagement trend from Gold messages daily (recent 15d vs prior 15d)
  const midMsg = Math.floor(goldMessages.length / 2);
  const recentMsgCounts = goldMessages
    .slice(0, midMsg)
    .map((d) => d.message_count);
  const priorMsgCounts = goldMessages.slice(midMsg).map((d) => d.message_count);
  const engagementChange = computeChangePct(recentMsgCounts, priorMsgCounts);

  // -- Health (from Gold health summary) --
  const goldHealth = extract(goldHealthDailyResult, []) as GoldHealthDailyRow[];

  const sleepMinutesValues = goldHealth
    .map((h) => h.sleep_minutes)
    .filter((v): v is number => v != null);
  const avgSleepMinutes =
    sleepMinutesValues.length > 0
      ? sleepMinutesValues.reduce((a, b) => a + b, 0) /
        sleepMinutesValues.length
      : null;
  // Normalize sleep_minutes to a 0-100 quality score (8h=100, 4h=0)
  const sleepQualityValues = sleepMinutesValues.map((m) =>
    Math.min(100, Math.max(0, (m / 480) * 100)),
  );
  const avgSleepQuality =
    sleepQualityValues.length > 0
      ? sleepQualityValues.reduce((a, b) => a + b, 0) /
        sleepQualityValues.length
      : null;
  const sleepTrend = computeTrend(sleepQualityValues);

  const hrvValues = goldHealth
    .map((h) => h.hrv_avg)
    .filter((v): v is number => v != null);
  const avgHRV =
    hrvValues.length > 0
      ? hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length
      : null;

  const heartRateValues = goldHealth
    .map((h) => h.heart_rate_avg)
    .filter((v): v is number => v != null);
  const avgHeartRate =
    heartRateValues.length > 0
      ? heartRateValues.reduce((a, b) => a + b, 0) / heartRateValues.length
      : null;

  const stepValues = goldHealth
    .map((h) => h.steps_total)
    .filter((v): v is number => v != null);
  const avgSteps =
    stepValues.length > 0
      ? stepValues.reduce((a, b) => a + b, 0) / stepValues.length
      : null;
  const activityTrend = computeTrend(stepValues);

  const activeMinutesValues = goldHealth
    .map((h) => h.active_minutes)
    .filter((v): v is number => v != null);
  const avgActiveMinutes =
    activeMinutesValues.length > 0
      ? activeMinutesValues.reduce((a, b) => a + b, 0) /
        activeMinutesValues.length
      : null;

  // Sleep quality change (recent 15d vs prior 15d from Gold)
  const midHealth = Math.floor(sleepQualityValues.length / 2);
  const recentSleep = sleepQualityValues.slice(0, midHealth);
  const priorSleep = sleepQualityValues.slice(midHealth);
  const sleepQualityChange = computeChangePct(recentSleep, priorSleep);

  // ============================================================================
  // EXTRACT & COMPUTE — Raw Queries
  // ============================================================================

  // Daily summaries — topics + mood (not in Gold)
  const summaries = extract(dailySummariesResult, []);
  const allTopics: string[] = [];
  let moodSum = 0;
  let moodCount = 0;
  for (const s of summaries as Array<{
    key_topics: string[] | null;
    mood_score: number | null;
  }>) {
    if (s.key_topics) allTopics.push(...s.key_topics);
    if (s.mood_score != null) {
      moodSum += s.mood_score;
      moodCount++;
    }
  }
  const topTopics = topN(allTopics, 5);

  // Predictions
  const predictions = extract(predictionsResult, []) as Array<{
    metric: string;
    probability: number;
    severity: string;
  }>;

  // Tasks
  const tasksCompleted = extractCount(tasksCompletedResult);
  const tasksPending = extractCount(tasksPendingResult);
  const tasksOverdue = extractCount(tasksOverdueResult);
  const tasksStalled = extractCount(tasksStalledResult);
  const tasksTotal = tasksCompleted + tasksPending;
  const completionRate = tasksTotal > 0 ? tasksCompleted / tasksTotal : 0;

  // Goals
  const goalRows = extract(goalsResult, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const goalStatuses = goalRows.map((g: any) => {
    const goal = Array.isArray(g.goal) ? g.goal[0] : g.goal;
    return {
      name: goal?.name ?? "Unknown",
      trajectory: g.trajectory as string,
      progress: (g.progress_percent as number) ?? 0,
      daysRemaining: g.days_remaining as number | null,
    };
  });

  // Highlights
  const highlights = extract(highlightsResult, []) as Array<{
    category: string;
    content: string;
    importance: number;
  }>;

  // Patterns
  const patterns = extract(patternsResult, []) as Array<{
    pattern_type: string;
    description: string;
    confidence: number;
  }>;

  // MITs
  const mits = extract(mitsResult, []) as Array<{
    rank: number;
    objective: string;
    score: number;
  }>;

  // Interventions
  const interventions = extract(interventionsResult, []) as Array<{
    status: string;
    user_feedback: string | null;
  }>;
  const totalInterventions = interventions.length;
  const completedInterventions = interventions.filter(
    (i) => i.status === "completed",
  ).length;
  const interventionSuccessRate =
    totalInterventions > 0 ? completedInterventions / totalInterventions : 0;
  const helpfulInterventions = interventions.filter(
    (i) => i.user_feedback === "helpful",
  ).length;
  const coachingAckRate =
    totalInterventions > 0 ? helpfulInterventions / totalInterventions : 0;

  // Feedback
  const feedbackRows = extract(feedbackResult, []) as Array<{
    rating: number;
  }>;
  const avgFeedbackRating =
    feedbackRows.length > 0
      ? feedbackRows.reduce((s, r) => s + (r.rating ?? 3), 0) /
        feedbackRows.length
      : null;

  // Emotion
  const emotionRows = extract(emotionResult, []) as Array<{
    valence: number | null;
  }>;
  const valences = emotionRows
    .map((e) => e.valence)
    .filter((v): v is number => v != null);
  const avgValence =
    valences.length > 0
      ? valences.reduce((a, b) => a + b, 0) / valences.length
      : 0;
  const emotionTrend = computeTrend(valences.map((v) => (v + 1) * 50));

  // Mood change (from emotion log)
  const recentValence = valences.slice(0, Math.floor(valences.length / 2));
  const priorValence = valences.slice(Math.floor(valences.length / 2));
  const moodChange = computeChangePct(
    recentValence.map((v) => (v + 1) * 50),
    priorValence.map((v) => (v + 1) * 50),
  );

  // Tenant personality
  const tenantData = extractSingle(tenantResult);
  const personality =
    (tenantData?.iors_personality as Record<string, unknown>) ?? {};
  const proactivityLevel = (personality.proactivity as number) ?? 50;
  const personalityStyle = (personality.style as string) ?? "balanced";

  // Gap detection — which domains have zero data?
  const missingDomains: string[] = [];
  if (goldHealth.length === 0 && sleepMinutesValues.length === 0)
    missingDomains.push("sleep");
  if (goldHealth.length === 0 && stepValues.length === 0)
    missingDomains.push("activity");
  if (emotionRows.length === 0) missingDomains.push("emotion");
  if (goalRows.length === 0) missingDomains.push("goals");
  missingDomains.push("finance", "social");

  const durationMs = Date.now() - startTime;
  logger.info(`[KAE:Collector] Snapshot collected in ${durationMs}ms`, {
    tenantId,
    dataSource: hasGoldData ? "gold" : "raw",
    goldDays: goldDaily.length,
    goldHealthDays: goldHealth.length,
    totalMessages,
    patterns: patterns.length,
    highlights: highlights.length,
  });

  return {
    tenantId,
    collectedAt: now,
    conversations: {
      totalMessages,
      avgPerDay,
      userMessagesPct,
      topTopics,
      emotionTrend,
      avgValence,
      channelBreakdown,
    },
    health: {
      sleepTrend,
      avgSleepQuality,
      avgSleepMinutes,
      avgHRV,
      avgHeartRate,
      activityTrend,
      avgSteps,
      avgActiveMinutes,
      activePredictions: predictions,
    },
    productivity: {
      completionRate,
      overdueCount: tasksOverdue,
      stalledCount: tasksStalled,
      totalPending: tasksPending,
      goalStatuses,
    },
    knowledge: {
      topHighlights: highlights.map((h) => ({
        category: h.category,
        content: h.content,
        importance: h.importance,
      })),
      activePatterns: patterns.map((p) => ({
        type: p.pattern_type,
        description: p.description,
        confidence: p.confidence,
      })),
      mits: mits.map((m) => ({
        rank: m.rank,
        objective: m.objective,
        score: m.score,
      })),
    },
    systemPerformance: {
      interventionSuccessRate,
      avgFeedbackRating,
      coachingAckRate,
      personalityStyle,
      proactivityLevel,
    },
    missingDomains,
    priorPeriodDelta: {
      sleepQualityChange,
      productivityChange: 0, // No Gold view for tasks yet
      engagementChange,
      moodChange,
    },
    dataSource: hasGoldData ? "gold" : "raw",
  };
}

/**
 * Create a hash of the snapshot for deduplication.
 * Two runs on the same day with identical key metrics produce the same hash.
 */
export function hashSnapshot(snapshot: TenantKnowledgeSnapshot): string {
  const key = [
    snapshot.tenantId,
    snapshot.collectedAt.toISOString().slice(0, 10),
    snapshot.conversations.totalMessages,
    snapshot.health.avgSleepQuality?.toFixed(1) ?? "null",
    snapshot.productivity.completionRate.toFixed(2),
    snapshot.knowledge.activePatterns.length,
  ].join("|");

  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

// ---- Helpers ----

function extract<T>(
  result: PromiseSettledResult<{ data: T | null; error: unknown }>,
  fallback: T,
): T {
  if (result.status === "fulfilled") {
    return result.value.data ?? fallback;
  }
  return fallback;
}

function extractCount(
  result: PromiseSettledResult<{ count: number | null; error: unknown }>,
): number {
  if (result.status === "fulfilled") {
    return result.value.count ?? 0;
  }
  return 0;
}

function extractSingle(
  result: PromiseSettledResult<{
    data: Record<string, unknown> | null;
    error: unknown;
  }>,
): Record<string, unknown> | null {
  if (result.status === "fulfilled") {
    return result.value.data;
  }
  return null;
}

function computeTrend(values: number[]): TrendDirection {
  if (values.length < 4) return "unknown";
  const mid = Math.floor(values.length / 2);
  const recent = values.slice(0, mid);
  const prior = values.slice(mid);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
  const changePct =
    priorAvg !== 0 ? ((recentAvg - priorAvg) / priorAvg) * 100 : 0;
  if (changePct > 10) return "improving";
  if (changePct < -10) return "declining";
  return "stable";
}

function computeChangePct(recent: number[], prior: number[]): number {
  if (recent.length === 0 || prior.length === 0) return 0;
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
  return priorAvg !== 0 ? ((recentAvg - priorAvg) / priorAvg) * 100 : 0;
}

function topN(items: string[], n: number): string[] {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const normalized = item.toLowerCase().trim();
    if (normalized) counts[normalized] = (counts[normalized] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}
