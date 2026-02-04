/**
 * Analytics Queries
 *
 * Pre-built queries for ExoSkull analytics dashboards.
 * Uses Gold layer (materialized views) for sub-100ms response times.
 * Falls back to Silver layer for real-time data.
 */

import { createClient } from "@supabase/supabase-js";

// ============================================================================
// Supabase Client
// ============================================================================

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ============================================================================
// Types
// ============================================================================

export interface DailySummary {
  date: string;
  conversation_count: number;
  avg_duration_seconds: number;
  total_duration_seconds: number;
  voice_count: number;
  sms_count: number;
  web_count: number;
  api_count: number;
}

export interface WeeklySummary {
  week_start: string;
  conversation_count: number;
  active_days: number;
  avg_duration_seconds: number;
  total_duration_seconds: number;
  voice_count: number;
  sms_count: number;
  web_count: number;
}

export interface MonthlySummary {
  month_start: string;
  conversation_count: number;
  active_days: number;
  avg_duration_seconds: number;
  total_duration_seconds: number;
  voice_count: number;
  sms_count: number;
  web_count: number;
}

export interface MessageDailySummary {
  date: string;
  message_count: number;
  user_messages: number;
  assistant_messages: number;
  system_messages: number;
  avg_duration_ms: number;
  unique_conversations: number;
}

export interface ConversationInsight {
  total_conversations: number;
  total_messages: number;
  avg_messages_per_conversation: number;
  avg_conversation_duration: number;
  most_active_channel: string;
  most_active_hour: number;
  engagement_trend: "increasing" | "decreasing" | "stable";
}

export interface QueryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  source: "gold" | "silver" | "bronze";
  durationMs: number;
}

// ============================================================================
// Gold Layer Queries (Pre-aggregated, <100ms)
// ============================================================================

/**
 * Get daily summary for a tenant
 */
export async function getDailySummary(
  tenantId: string,
  days: number = 30,
): Promise<QueryResult<DailySummary[]>> {
  const startTime = Date.now();

  try {
    const { data, error } = await getSupabase()
      .from("exo_gold_daily_summary")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("date", { ascending: false })
      .limit(days);

    if (error) throw error;

    return {
      success: true,
      data: data || [],
      source: "gold",
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error("[Analytics] getDailySummary failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Query failed",
      source: "gold",
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Get weekly summary for a tenant
 */
export async function getWeeklySummary(
  tenantId: string,
  weeks: number = 12,
): Promise<QueryResult<WeeklySummary[]>> {
  const startTime = Date.now();

  try {
    const { data, error } = await getSupabase()
      .from("exo_gold_weekly_summary")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("week_start", { ascending: false })
      .limit(weeks);

    if (error) throw error;

    return {
      success: true,
      data: data || [],
      source: "gold",
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error("[Analytics] getWeeklySummary failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Query failed",
      source: "gold",
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Get monthly summary for a tenant
 */
export async function getMonthlySummary(
  tenantId: string,
  months: number = 12,
): Promise<QueryResult<MonthlySummary[]>> {
  const startTime = Date.now();

  try {
    const { data, error } = await getSupabase()
      .from("exo_gold_monthly_summary")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("month_start", { ascending: false })
      .limit(months);

    if (error) throw error;

    return {
      success: true,
      data: data || [],
      source: "gold",
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error("[Analytics] getMonthlySummary failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Query failed",
      source: "gold",
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Get message daily summary for a tenant
 */
export async function getMessagesDailySummary(
  tenantId: string,
  days: number = 30,
): Promise<QueryResult<MessageDailySummary[]>> {
  const startTime = Date.now();

  try {
    const { data, error } = await getSupabase()
      .from("exo_gold_messages_daily")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("date", { ascending: false })
      .limit(days);

    if (error) throw error;

    return {
      success: true,
      data: data || [],
      source: "gold",
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error("[Analytics] getMessagesDailySummary failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Query failed",
      source: "gold",
      durationMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Silver Layer Queries (Real-time, slightly slower)
// ============================================================================

/**
 * Get real-time conversation stats (bypasses Gold layer)
 */
export async function getRealTimeStats(tenantId: string): Promise<
  QueryResult<{
    conversationsToday: number;
    messagesTotal: number;
    avgDurationToday: number;
    activeHours: number[];
  }>
> {
  const startTime = Date.now();

  try {
    const today = new Date().toISOString().split("T")[0];

    // Get today's conversations
    const { data: todayConvos, error: convError } = await getSupabase()
      .from("exo_silver_conversations")
      .select("duration_seconds, started_at")
      .eq("tenant_id", tenantId)
      .gte("started_at", today);

    if (convError) throw convError;

    // Get total message count
    const { count: messageCount, error: msgError } = await getSupabase()
      .from("exo_silver_messages")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    if (msgError) throw msgError;

    // Calculate stats
    const conversationsToday = todayConvos?.length || 0;
    const avgDurationToday =
      conversationsToday > 0
        ? Math.round(
            todayConvos!.reduce(
              (sum, c) => sum + (c.duration_seconds || 0),
              0,
            ) / conversationsToday,
          )
        : 0;

    // Get active hours
    const activeHours = todayConvos
      ? [...new Set(todayConvos.map((c) => new Date(c.started_at).getHours()))]
      : [];

    return {
      success: true,
      data: {
        conversationsToday,
        messagesTotal: messageCount || 0,
        avgDurationToday,
        activeHours: activeHours.sort((a, b) => a - b),
      },
      source: "silver",
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error("[Analytics] getRealTimeStats failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Query failed",
      source: "silver",
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Get recent conversations with details
 */
export async function getRecentConversations(
  tenantId: string,
  limit: number = 10,
): Promise<
  QueryResult<
    Array<{
      id: string;
      channel: string;
      started_at: string;
      duration_seconds: number;
      summary: string | null;
      message_count: number;
    }>
  >
> {
  const startTime = Date.now();

  try {
    // Get recent conversations
    const { data: conversations, error: convError } = await getSupabase()
      .from("exo_silver_conversations")
      .select("id, channel, started_at, duration_seconds, summary")
      .eq("tenant_id", tenantId)
      .order("started_at", { ascending: false })
      .limit(limit);

    if (convError) throw convError;

    // Get message counts for each conversation
    const conversationIds = conversations?.map((c) => c.id) || [];

    if (conversationIds.length === 0) {
      return {
        success: true,
        data: [],
        source: "silver",
        durationMs: Date.now() - startTime,
      };
    }

    // Count messages per conversation
    const { data: messageCounts, error: msgError } = await getSupabase()
      .from("exo_silver_messages")
      .select("conversation_id")
      .in("conversation_id", conversationIds);

    if (msgError) throw msgError;

    // Build count map
    const countMap = new Map<string, number>();
    for (const msg of messageCounts || []) {
      countMap.set(
        msg.conversation_id,
        (countMap.get(msg.conversation_id) || 0) + 1,
      );
    }

    // Combine data
    const result = conversations!.map((c) => ({
      id: c.id,
      channel: c.channel,
      started_at: c.started_at,
      duration_seconds: c.duration_seconds || 0,
      summary: c.summary,
      message_count: countMap.get(c.id) || 0,
    }));

    return {
      success: true,
      data: result,
      source: "silver",
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error("[Analytics] getRecentConversations failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Query failed",
      source: "silver",
      durationMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Derived Insights
// ============================================================================

/**
 * Generate conversation insights from aggregated data
 */
export async function getConversationInsights(
  tenantId: string,
): Promise<QueryResult<ConversationInsight>> {
  const startTime = Date.now();

  try {
    // Get weekly data for trend analysis
    const weeklyResult = await getWeeklySummary(tenantId, 4);
    const dailyResult = await getDailySummary(tenantId, 7);

    if (!weeklyResult.success || !dailyResult.success) {
      throw new Error("Failed to fetch aggregated data");
    }

    const weekly = weeklyResult.data || [];
    const daily = dailyResult.data || [];

    // Calculate totals
    const totalConversations = weekly.reduce(
      (sum, w) => sum + w.conversation_count,
      0,
    );
    const totalDuration = weekly.reduce(
      (sum, w) => sum + w.total_duration_seconds,
      0,
    );

    // Get message count from Silver (Gold doesn't have total messages in weekly)
    const { count: totalMessages } = await getSupabase()
      .from("exo_silver_messages")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    // Find most active channel
    const channelCounts = {
      voice: weekly.reduce((sum, w) => sum + w.voice_count, 0),
      sms: weekly.reduce((sum, w) => sum + w.sms_count, 0),
      web: weekly.reduce((sum, w) => sum + w.web_count, 0),
    };
    const mostActiveChannel = Object.entries(channelCounts).sort(
      (a, b) => b[1] - a[1],
    )[0][0];

    // Determine engagement trend
    let engagementTrend: "increasing" | "decreasing" | "stable" = "stable";
    if (weekly.length >= 2) {
      const recent = weekly[0]?.conversation_count || 0;
      const previous = weekly[1]?.conversation_count || 0;
      if (recent > previous * 1.1) engagementTrend = "increasing";
      else if (recent < previous * 0.9) engagementTrend = "decreasing";
    }

    // Find most active hour (from daily data - simplified)
    // In production, you'd query hourly aggregation
    const mostActiveHour = 9; // Default to 9 AM

    return {
      success: true,
      data: {
        total_conversations: totalConversations,
        total_messages: totalMessages || 0,
        avg_messages_per_conversation:
          totalConversations > 0
            ? Math.round((totalMessages || 0) / totalConversations)
            : 0,
        avg_conversation_duration:
          totalConversations > 0
            ? Math.round(totalDuration / totalConversations)
            : 0,
        most_active_channel: mostActiveChannel,
        most_active_hour: mostActiveHour,
        engagement_trend: engagementTrend,
      },
      source: "gold",
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error("[Analytics] getConversationInsights failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Query failed",
      source: "gold",
      durationMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Comparison Queries
// ============================================================================

/**
 * Compare current period to previous period
 */
export async function getPeriodComparison(
  tenantId: string,
  periodDays: number = 7,
): Promise<
  QueryResult<{
    current: { conversations: number; duration: number; messages: number };
    previous: { conversations: number; duration: number; messages: number };
    change: {
      conversations: number; // percentage change
      duration: number;
      messages: number;
    };
  }>
> {
  const startTime = Date.now();

  try {
    const now = new Date();
    const periodStart = new Date(
      now.getTime() - periodDays * 24 * 60 * 60 * 1000,
    );
    const previousPeriodStart = new Date(
      periodStart.getTime() - periodDays * 24 * 60 * 60 * 1000,
    );

    // Current period conversations
    const { data: currentConvos } = await getSupabase()
      .from("exo_silver_conversations")
      .select("id, duration_seconds")
      .eq("tenant_id", tenantId)
      .gte("started_at", periodStart.toISOString());

    // Previous period conversations
    const { data: previousConvos } = await getSupabase()
      .from("exo_silver_conversations")
      .select("id, duration_seconds")
      .eq("tenant_id", tenantId)
      .gte("started_at", previousPeriodStart.toISOString())
      .lt("started_at", periodStart.toISOString());

    // Current period messages
    const { count: currentMsgs } = await getSupabase()
      .from("exo_silver_messages")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("timestamp", periodStart.toISOString());

    // Previous period messages
    const { count: previousMsgs } = await getSupabase()
      .from("exo_silver_messages")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("timestamp", previousPeriodStart.toISOString())
      .lt("timestamp", periodStart.toISOString());

    const current = {
      conversations: currentConvos?.length || 0,
      duration:
        currentConvos?.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) ||
        0,
      messages: currentMsgs || 0,
    };

    const previous = {
      conversations: previousConvos?.length || 0,
      duration:
        previousConvos?.reduce(
          (sum, c) => sum + (c.duration_seconds || 0),
          0,
        ) || 0,
      messages: previousMsgs || 0,
    };

    const calcChange = (curr: number, prev: number): number => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };

    return {
      success: true,
      data: {
        current,
        previous,
        change: {
          conversations: calcChange(
            current.conversations,
            previous.conversations,
          ),
          duration: calcChange(current.duration, previous.duration),
          messages: calcChange(current.messages, previous.messages),
        },
      },
      source: "silver",
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error("[Analytics] getPeriodComparison failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Query failed",
      source: "silver",
      durationMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Export
// ============================================================================

export default {
  // Gold layer (fast, pre-aggregated)
  getDailySummary,
  getWeeklySummary,
  getMonthlySummary,
  getMessagesDailySummary,

  // Silver layer (real-time)
  getRealTimeStats,
  getRecentConversations,

  // Derived insights
  getConversationInsights,
  getPeriodComparison,
};
