/**
 * Baseline Monitor — Goal suggestion from existing data & conversation patterns.
 *
 * Replaces blind-spot detection with consent-based goal suggestions:
 * - From data: detect rig data without matching goal
 * - From conversation: analyze recurring topics (3+ mentions without goal)
 * - All suggestions are PROPOSALS, never auto-created. User must accept.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { sendProactiveMessage } from "@/lib/cron/tenant-utils";
import { canSendProactive } from "@/lib/autonomy/outbound-triggers";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

interface GoalSuggestion {
  source: "data" | "conversation" | "onboarding";
  suggestedName: string;
  suggestedCategory: string;
  reason: string;
  confidence: number; // 0-1
}

export interface BaselineMonitorResult {
  tenantId: string;
  suggestions: GoalSuggestion[];
  notified: boolean;
}

// ============================================================================
// MAIN
// ============================================================================

/**
 * Run baseline monitor for tenants with few active goals.
 * Suggests new goals based on existing data and patterns.
 */
export async function runBaselineMonitor(
  tenantId: string,
): Promise<BaselineMonitorResult> {
  const result: BaselineMonitorResult = {
    tenantId,
    suggestions: [],
    notified: false,
  };

  try {
    const supabase = getServiceSupabase();

    // Get active goal categories
    const { data: activeGoals } = await supabase
      .from("exo_user_goals")
      .select("category")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);

    const activeCategories = new Set<string>(
      (activeGoals || []).map((g) => g.category as string),
    );

    // Check data sources without matching goals
    const dataSuggestions = await detectDataWithoutGoals(
      tenantId,
      activeCategories,
    );
    result.suggestions.push(...dataSuggestions);

    // Check conversation patterns
    const convSuggestions = await detectConversationPatterns(
      tenantId,
      activeCategories,
    );
    result.suggestions.push(...convSuggestions);

    // Sort by confidence and take top suggestion
    result.suggestions.sort((a, b) => b.confidence - a.confidence);

    // Notify user about top suggestion (max 1 per run)
    if (result.suggestions.length > 0) {
      const top = result.suggestions[0];
      if (top.confidence >= 0.6 && (await canSendProactive(tenantId))) {
        // Check dedup — don't suggest same thing twice in 7 days
        const sevenDaysAgo = new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000,
        ).toISOString();
        const { data: recentSuggestions } = await supabase
          .from("exo_proactive_log")
          .select("trigger_type")
          .eq("tenant_id", tenantId)
          .like("trigger_type", `goal_suggestion:${top.suggestedCategory}%`)
          .gte("created_at", sevenDaysAgo);

        if (!recentSuggestions || recentSuggestions.length === 0) {
          const message = formatSuggestionMessage(top);
          await sendProactiveMessage(
            tenantId,
            message,
            `goal_suggestion:${top.suggestedCategory}`,
            "baseline-monitor",
          );
          result.notified = true;
        }
      }
    }
  } catch (err) {
    logger.error("[BaselineMonitor] Failed:", {
      tenantId,
      error: err instanceof Error ? err.message : err,
    });
  }

  return result;
}

// ============================================================================
// DATA DETECTION
// ============================================================================

async function detectDataWithoutGoals(
  tenantId: string,
  activeCategories: Set<string>,
): Promise<GoalSuggestion[]> {
  const supabase = getServiceSupabase();
  const suggestions: GoalSuggestion[] = [];

  // Check health metrics without health goal
  if (!activeCategories.has("health")) {
    const { count: healthCount } = await supabase
      .from("exo_health_metrics")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte(
        "recorded_at",
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      );

    if (healthCount && healthCount >= 3) {
      suggestions.push({
        source: "data",
        suggestedName: "Zdrowie i aktywnosc",
        suggestedCategory: "health",
        reason: `Masz ${healthCount} wpisow zdrowotnych z ostatniego tygodnia, ale brak celu zdrowotnego.`,
        confidence: 0.85,
      });
    }
  }

  // Check mood entries without mental goal
  if (!activeCategories.has("mental")) {
    const { count: moodCount } = await supabase
      .from("exo_mood_entries")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte(
        "logged_at",
        new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      );

    if (moodCount && moodCount >= 5) {
      suggestions.push({
        source: "data",
        suggestedName: "Lepszy nastroj i energia",
        suggestedCategory: "mental",
        reason: `Logujesz nastroj regularnie — chcesz ustawic cel poprawy?`,
        confidence: 0.75,
      });
    }
  }

  // Check tasks without productivity goal
  if (!activeCategories.has("productivity")) {
    const { count: taskCount } = await supabase
      .from("exo_tasks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte(
        "created_at",
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      );

    if (taskCount && taskCount >= 10) {
      suggestions.push({
        source: "data",
        suggestedName: "Produktywnosc i efektywnosc",
        suggestedCategory: "productivity",
        reason: `Masz ${taskCount} taskow z ostatniego tygodnia — chcesz sledzic produktywnosc?`,
        confidence: 0.65,
      });
    }
  }

  // Check financial data without finance goal
  if (!activeCategories.has("finance")) {
    const { count: finCount } = await supabase
      .from("exo_generated_apps")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .or("slug.ilike.%expense%,slug.ilike.%budget%,slug.ilike.%finance%");

    if (finCount && finCount > 0) {
      suggestions.push({
        source: "data",
        suggestedName: "Kontrola wydatkow",
        suggestedCategory: "finance",
        reason: "Masz tracker finansowy — chcesz ustawic cel oszczednosciowy?",
        confidence: 0.7,
      });
    }
  }

  return suggestions;
}

// ============================================================================
// CONVERSATION PATTERN DETECTION
// ============================================================================

async function detectConversationPatterns(
  tenantId: string,
  activeCategories: Set<string>,
): Promise<GoalSuggestion[]> {
  const supabase = getServiceSupabase();
  const suggestions: GoalSuggestion[] = [];

  // Look for recurring topics in recent messages (last 14 days)
  const fourteenDaysAgo = new Date(
    Date.now() - 14 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: messages } = await supabase
    .from("exo_unified_messages")
    .select("content")
    .eq("tenant_id", tenantId)
    .eq("direction", "inbound")
    .gte("created_at", fourteenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!messages || messages.length < 5) return suggestions;

  // Simple keyword-based topic detection
  const topicKeywords: Record<
    string,
    { category: string; keywords: string[] }
  > = {
    exercise: {
      category: "health",
      keywords: [
        "bieganie",
        "biegać",
        "silownia",
        "trening",
        "cwiczenia",
        "running",
        "gym",
        "workout",
        "exercise",
      ],
    },
    sleep: {
      category: "health",
      keywords: ["sen", "spanie", "spać", "budzenie", "sleep", "insomnia"],
    },
    reading: {
      category: "learning",
      keywords: ["czytanie", "czytać", "ksiazka", "book", "reading", "learn"],
    },
    meditation: {
      category: "mental",
      keywords: [
        "medytacja",
        "mindfulness",
        "medytować",
        "meditation",
        "relaks",
        "stres",
      ],
    },
  };

  const allContent = messages
    .map((m) => (m.content || "").toLowerCase())
    .join(" ");

  for (const [topic, { category, keywords }] of Object.entries(topicKeywords)) {
    if (activeCategories.has(category)) continue;

    const mentionCount = keywords.reduce((count, kw) => {
      const matches = allContent.split(kw).length - 1;
      return count + matches;
    }, 0);

    if (mentionCount >= 3) {
      suggestions.push({
        source: "conversation",
        suggestedName: topic.charAt(0).toUpperCase() + topic.slice(1),
        suggestedCategory: category,
        reason: `Wspominales o ${topic} ${mentionCount}x w ostatnich 2 tygodniach.`,
        confidence: Math.min(0.9, 0.5 + mentionCount * 0.1),
      });
    }
  }

  return suggestions;
}

// ============================================================================
// FORMATTING
// ============================================================================

function formatSuggestionMessage(suggestion: GoalSuggestion): string {
  const intro =
    suggestion.source === "data"
      ? "Zauwazam ze masz dane, ale brak celu"
      : "Czesto o tym rozmawiasz";

  return `${intro} — ${suggestion.reason} Chcesz stworzyc cel "${suggestion.suggestedName}"? Napisz tak lub podaj wlasna nazwe.`;
}
