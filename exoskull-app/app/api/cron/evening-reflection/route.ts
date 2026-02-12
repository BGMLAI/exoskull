/**
 * Evening Reflection CRON
 *
 * Runs at 19:00 UTC (~20:00-21:00 CET/CEST) to send personalized
 * evening reflections that help the user wind down and reflect on their day.
 *
 * Unlike daily-summary, this is ALWAYS sent (even if user was silent today)
 * because proactive engagement is a core ExoSkull value.
 *
 * Schedule: daily at 19:00 UTC (Vercel cron)
 */

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getTasks } from "@/lib/tasks/task-service";
import { getActiveGoalCount } from "@/lib/goals/goal-service";
import { aiChat } from "@/lib/ai";
import { canSendProactive } from "@/lib/autonomy/outbound-triggers";
import {
  getActiveTenants,
  isWithinHours,
  isQuietHours,
  sendProactiveMessage,
} from "@/lib/cron/tenant-utils";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIMEOUT_MS = 50_000;

// ============================================================================
// DATA GATHERING
// ============================================================================

interface DaySnapshot {
  tasksCompleted: number;
  taskTitles: string[];
  conversationCount: number;
  moodEntries: Array<{
    mood_value: number;
    energy_level: number | null;
    logged_at: string;
  }>;
  goalsActive: number;
  proactiveActions: number;
  emotionSummary: string | null;
}

async function gatherDayData(tenantId: string): Promise<DaySnapshot> {
  const supabase = getServiceSupabase();
  const today = new Date().toISOString().split("T")[0];
  const todayStart = `${today}T00:00:00`;

  const [
    tasksResult,
    messagesResult,
    moodResult,
    goalsResult,
    proactiveResult,
    emotionResult,
  ] = await Promise.allSettled([
    // Tasks completed today (via dual-read service)
    getTasks(tenantId, { status: "done", limit: 10 }),

    // Conversation count today
    supabase
      .from("exo_unified_messages")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", todayStart),

    // Mood/energy entries today
    supabase
      .from("exo_mood_entries")
      .select("mood_value, energy_level, logged_at")
      .eq("tenant_id", tenantId)
      .gte("logged_at", todayStart)
      .order("logged_at", { ascending: false })
      .limit(5),

    // Active goals count (via dual-read service)
    getActiveGoalCount(tenantId),

    // Proactive actions today
    supabase
      .from("exo_proactive_log")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", todayStart),

    // Recent emotions for tone calibration
    supabase
      .from("exo_emotion_log")
      .select("primary_emotion, valence")
      .eq("tenant_id", tenantId)
      .gte("created_at", todayStart)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // getTasks() returns Task[] directly, getActiveGoalCount() returns number
  const tasks =
    tasksResult.status === "fulfilled" ? tasksResult.value || [] : [];
  const msgCount =
    messagesResult.status === "fulfilled" ? messagesResult.value.count || 0 : 0;
  const moods =
    moodResult.status === "fulfilled" ? moodResult.value.data || [] : [];
  const goalsCount =
    goalsResult.status === "fulfilled" ? goalsResult.value || 0 : 0;
  const proactiveCount =
    proactiveResult.status === "fulfilled"
      ? proactiveResult.value.count || 0
      : 0;

  // Summarize emotions
  let emotionSummary: string | null = null;
  if (
    emotionResult.status === "fulfilled" &&
    emotionResult.value.data?.length
  ) {
    const emotions = emotionResult.value.data;
    const avgValence =
      emotions.reduce(
        (sum: number, e: { valence: number | null }) => sum + (e.valence ?? 0),
        0,
      ) / emotions.length;
    const dominantEmotion = emotions[0]?.primary_emotion || null;
    emotionSummary = `dominant: ${dominantEmotion}, avg valence: ${avgValence.toFixed(2)}`;
  }

  return {
    tasksCompleted: tasks.length,
    taskTitles: tasks.map((t: { title: string }) => t.title).slice(0, 5),
    conversationCount: msgCount,
    moodEntries: moods,
    goalsActive: goalsCount,
    proactiveActions: proactiveCount,
    emotionSummary,
  };
}

// ============================================================================
// AI MESSAGE FORMATTING
// ============================================================================

async function formatReflectionMessage(
  tenantName: string,
  language: string,
  snapshot: DaySnapshot,
): Promise<string> {
  const dataContext = [
    `Tasks completed today: ${snapshot.tasksCompleted}`,
    snapshot.taskTitles.length > 0
      ? `Task titles: ${snapshot.taskTitles.join(", ")}`
      : null,
    `Conversations today: ${snapshot.conversationCount}`,
    snapshot.moodEntries.length > 0
      ? `Mood entries: ${snapshot.moodEntries.map((m) => `${m.mood_value}/10`).join(", ")}`
      : null,
    `Active goals: ${snapshot.goalsActive}`,
    snapshot.proactiveActions > 0
      ? `Proactive actions taken: ${snapshot.proactiveActions}`
      : null,
    snapshot.emotionSummary
      ? `Emotional tone: ${snapshot.emotionSummary}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const wasQuietDay =
    snapshot.conversationCount === 0 && snapshot.tasksCompleted === 0;

  const systemPrompt = `You are ExoSkull, a warm and empathetic personal AI companion.
Generate an evening reflection message for ${tenantName || "the user"}.

Rules:
- Language: ${language} (match naturally, don't mix languages)
- Keep it SHORT: 2-4 sentences max
- Be warm and genuine, not corporate or robotic
- If the day had activity, briefly acknowledge what they did
- If it was a quiet day, be gentle — no guilt, just check in
- End with an open question inviting them to share how their day went
- NO bullet points, NO emoji overload (1-2 max), NO headers
- Sound like a caring friend, not a productivity app`;

  const userPrompt = wasQuietDay
    ? `It was a quiet day — no conversations or tasks logged. Send a gentle evening check-in.`
    : `Here's what happened today:\n${dataContext}\n\nSend a warm evening reflection based on this.`;

  try {
    const response = await aiChat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        taskCategory: "simple_response",
        maxTokens: 300,
        temperature: 0.8,
      },
    );
    return response.content;
  } catch (error) {
    console.error("[EveningReflection] AI formatting failed:", error);
    // Fallback message
    return language === "pl"
      ? `Dobry wieczor${tenantName ? `, ${tenantName}` : ""}! Jak minal Ci dzien? Napisz kilka slow - chetnie poslucha.`
      : `Good evening${tenantName ? `, ${tenantName}` : ""}! How was your day? Drop me a few words - I'd love to hear.`;
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

async function handler(req: NextRequest) {
  const startTime = Date.now();

  logger.info("[EveningReflection] Starting evening reflection CRON...");

  const results = {
    processed: 0,
    sent: 0,
    skipped_time: 0,
    skipped_quiet: 0,
    skipped_rate: 0,
    errors: [] as string[],
  };

  try {
    const tenants = await getActiveTenants();
    logger.info(`[EveningReflection] Found ${tenants.length} active tenants`);

    for (const tenant of tenants) {
      // Timeout safety net
      if (Date.now() - startTime > TIMEOUT_MS) {
        logger.warn("[EveningReflection] Approaching timeout, stopping early");
        break;
      }

      results.processed++;

      try {
        // Check timezone: is it 20:00-22:00 in their timezone?
        if (!isWithinHours(tenant.timezone, 20, 22)) {
          results.skipped_time++;
          continue;
        }

        // Check quiet hours
        if (isQuietHours(tenant.timezone, tenant.schedule_settings)) {
          results.skipped_quiet++;
          continue;
        }

        // Check rate limit
        if (!(await canSendProactive(tenant.id))) {
          results.skipped_rate++;
          continue;
        }

        // Gather day data
        const snapshot = await gatherDayData(tenant.id);

        // Detect language from tenant preferences
        const language = tenant.timezone?.startsWith("Europe/Warsaw")
          ? "pl"
          : "en";

        // Generate reflection message via Gemini Flash
        const message = await formatReflectionMessage(
          tenant.name || "",
          language,
          snapshot,
        );

        // Send via unified proactive message
        await sendProactiveMessage(tenant.id, message, "evening_reflection");

        results.sent++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        results.errors.push(`${tenant.id}: ${errorMessage}`);
        console.error(
          `[EveningReflection] Error processing tenant ${tenant.id}:`,
          error,
        );
      }
    }

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      results,
    };

    logger.info("[EveningReflection] Completed:", response);
    return NextResponse.json(response);
  } catch (error) {
    console.error("[EveningReflection] Fatal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        results,
      },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "evening-reflection" }, handler);
