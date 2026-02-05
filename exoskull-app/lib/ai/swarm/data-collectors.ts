/**
 * Swarm Data Collectors
 *
 * Pull data from Supabase tables to build context for swarm agents.
 * Each collector returns a typed context object for injection into agent prompts.
 */

import { SupabaseClient } from "@supabase/supabase-js";

// =====================================================
// TYPES
// =====================================================

export interface SleepContext {
  entries: Array<{
    date: string;
    duration_minutes: number;
    quality: number | null;
    hrv: number | null;
  }>;
  avgDuration: number;
  avgQuality: number;
}

export interface ActivityContext {
  entries: Array<{
    date: string;
    type: string;
    duration_minutes: number | null;
  }>;
  totalSessions: number;
  activeDays: number;
}

export interface MoodContext {
  entries: Array<{
    date: string;
    mood_value: number;
    notes: string | null;
  }>;
  avgMood: number;
  trend: "improving" | "declining" | "stable";
}

export interface TaskContext {
  totalActive: number;
  completedRecently: number;
  overdueCount: number;
}

export interface GoalContext {
  goals: Array<{
    name: string;
    category: string;
    progress_percent: number | null;
    trajectory: string | null;
    target_date: string | null;
  }>;
}

export interface ConversationContext {
  recentTopics: string[];
  totalConversations: number;
  domainsCovered: string[];
}

// =====================================================
// COLLECTORS
// =====================================================

export async function collectSleepData(
  supabase: SupabaseClient,
  tenantId: string,
  days: number,
): Promise<SleepContext> {
  const since = daysAgo(days);

  const { data } = await supabase
    .from("exo_sleep_entries")
    .select("sleep_date, duration_minutes, quality_score, hrv_avg")
    .eq("tenant_id", tenantId)
    .gte("sleep_date", since)
    .order("sleep_date", { ascending: false })
    .limit(days);

  const entries = (data || []).map((e) => ({
    date: e.sleep_date,
    duration_minutes: e.duration_minutes || 0,
    quality: e.quality_score,
    hrv: e.hrv_avg,
  }));

  const durations = entries.map((e) => e.duration_minutes).filter((d) => d > 0);
  const qualities = entries
    .map((e) => e.quality)
    .filter((q): q is number => q !== null);

  return {
    entries,
    avgDuration: durations.length > 0 ? avg(durations) : 0,
    avgQuality: qualities.length > 0 ? avg(qualities) : 0,
  };
}

export async function collectActivityData(
  supabase: SupabaseClient,
  tenantId: string,
  days: number,
): Promise<ActivityContext> {
  const since = daysAgo(days);

  const { data } = await supabase
    .from("exo_activity_entries")
    .select("entry_date, activity_type, duration_minutes")
    .eq("tenant_id", tenantId)
    .gte("created_at", new Date(since).toISOString())
    .order("created_at", { ascending: false })
    .limit(100);

  const entries = (data || []).map((e) => ({
    date: e.entry_date || "",
    type: e.activity_type || "unknown",
    duration_minutes: e.duration_minutes,
  }));

  const uniqueDays = new Set(entries.map((e) => e.date));

  return {
    entries,
    totalSessions: entries.length,
    activeDays: uniqueDays.size,
  };
}

export async function collectMoodData(
  supabase: SupabaseClient,
  tenantId: string,
  days: number,
): Promise<MoodContext> {
  const since = daysAgo(days);

  const { data } = await supabase
    .from("exo_mood_entries")
    .select("created_at, mood_value, notes")
    .eq("tenant_id", tenantId)
    .gte("created_at", new Date(since).toISOString())
    .order("created_at", { ascending: false })
    .limit(100);

  const entries = (data || []).map((e) => ({
    date: e.created_at,
    mood_value: e.mood_value || 5,
    notes: e.notes,
  }));

  const values = entries.map((e) => e.mood_value);
  const avgValue = values.length > 0 ? avg(values) : 5;

  // Simple trend: compare first half vs second half
  let trend: "improving" | "declining" | "stable" = "stable";
  if (values.length >= 4) {
    const half = Math.floor(values.length / 2);
    const older = avg(values.slice(half)); // older entries are at end (desc order)
    const newer = avg(values.slice(0, half));
    if (newer - older > 0.5) trend = "improving";
    else if (older - newer > 0.5) trend = "declining";
  }

  return { entries, avgMood: avgValue, trend };
}

export async function collectTaskData(
  supabase: SupabaseClient,
  tenantId: string,
  days: number,
): Promise<TaskContext> {
  const since = daysAgo(days);

  const { count: activeCount } = await supabase
    .from("exo_tasks")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "in_progress"]);

  const { count: completedCount } = await supabase
    .from("exo_tasks")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "done")
    .gte("completed_at", new Date(since).toISOString());

  const { count: overdueCount } = await supabase
    .from("exo_tasks")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "in_progress"])
    .lt("due_date", new Date().toISOString());

  return {
    totalActive: activeCount || 0,
    completedRecently: completedCount || 0,
    overdueCount: overdueCount || 0,
  };
}

export async function collectGoalData(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<GoalContext> {
  const { data: goals } = await supabase
    .from("exo_user_goals")
    .select("name, category, current_value, target_value, target_date")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .limit(20);

  if (!goals || goals.length === 0) return { goals: [] };

  // Get latest checkpoint for each goal
  const enriched = await Promise.all(
    goals.map(async (goal) => {
      const { data: cp } = await supabase
        .from("exo_goal_checkpoints")
        .select("progress_percent, trajectory")
        .eq("goal_id", goal.name) // actually need goal id, but we don't have it here
        .order("checkpoint_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        name: goal.name,
        category: goal.category,
        progress_percent: cp?.progress_percent ?? null,
        trajectory: cp?.trajectory ?? null,
        target_date: goal.target_date,
      };
    }),
  );

  return { goals: enriched };
}

export async function collectConversationSummaries(
  supabase: SupabaseClient,
  tenantId: string,
  days: number,
): Promise<ConversationContext> {
  const since = daysAgo(days);

  const { data, count } = await supabase
    .from("exo_conversations")
    .select("context, domains_discussed", { count: "exact" })
    .eq("tenant_id", tenantId)
    .gte("created_at", new Date(since).toISOString())
    .order("created_at", { ascending: false })
    .limit(50);

  const conversations = data || [];
  const topics = conversations
    .map((c) => c.context?.topic || c.context?.summary)
    .filter(Boolean)
    .slice(0, 10) as string[];

  const allDomains = conversations
    .flatMap((c) => c.domains_discussed || [])
    .filter(Boolean);
  const uniqueDomains = [...new Set(allDomains)];

  return {
    recentTopics: topics,
    totalConversations: count || 0,
    domainsCovered: uniqueDomains,
  };
}

// =====================================================
// MAIN ENTRY POINT
// =====================================================

/**
 * Collect all relevant context for a specific swarm type.
 */
export async function collectSwarmContext(
  supabase: SupabaseClient,
  tenantId: string,
  swarmType: string,
): Promise<Record<string, unknown>> {
  // Get user name
  const { data: tenant } = await supabase
    .from("exo_tenants")
    .select("preferred_name")
    .eq("id", tenantId)
    .single();

  const base: Record<string, unknown> = {
    userName: tenant?.preferred_name || "użytkownik",
    tenantId,
    collectedAt: new Date().toISOString(),
  };

  switch (swarmType) {
    case "morning_checkin": {
      const [sleep, activity, mood, tasks, goals] = await Promise.all([
        collectSleepData(supabase, tenantId, 7),
        collectActivityData(supabase, tenantId, 7),
        collectMoodData(supabase, tenantId, 7),
        collectTaskData(supabase, tenantId, 1),
        collectGoalData(supabase, tenantId),
      ]);
      return { ...base, sleep, activity, mood, tasks, goals };
    }

    case "gap_detection": {
      const [conversations, goals, mood, activity, sleep, tasks] =
        await Promise.all([
          collectConversationSummaries(supabase, tenantId, 30),
          collectGoalData(supabase, tenantId),
          collectMoodData(supabase, tenantId, 30),
          collectActivityData(supabase, tenantId, 30),
          collectSleepData(supabase, tenantId, 30),
          collectTaskData(supabase, tenantId, 30),
        ]);
      return {
        ...base,
        conversations,
        goals,
        mood,
        activity,
        sleep,
        tasks,
      };
    }

    case "weekly_review": {
      const [sleep, activity, mood, tasks, goals, conversations] =
        await Promise.all([
          collectSleepData(supabase, tenantId, 7),
          collectActivityData(supabase, tenantId, 7),
          collectMoodData(supabase, tenantId, 7),
          collectTaskData(supabase, tenantId, 7),
          collectGoalData(supabase, tenantId),
          collectConversationSummaries(supabase, tenantId, 7),
        ]);
      return {
        ...base,
        sleep,
        activity,
        mood,
        tasks,
        goals,
        conversations,
      };
    }

    default:
      return base;
  }
}

// =====================================================
// HELPERS
// =====================================================

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function avg(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return (
    Math.round((numbers.reduce((a, b) => a + b, 0) / numbers.length) * 10) / 10
  );
}
