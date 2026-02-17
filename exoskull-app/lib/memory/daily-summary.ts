/**
 * Daily Summary System
 *
 * Generates AI-powered daily summaries that user can review and correct.
 * Part of "best memory on the market" system.
 *
 * Flow:
 * 1. 21:00 CRON generates draft summary from day's conversations
 * 2. System calls/texts user with summary
 * 3. User can correct/add information
 * 4. Corrections stored, final summary saved
 */

import { createClient } from "@supabase/supabase-js";
import { getModelRouter } from "../ai/model-router";
import { getUserHighlights } from "./highlights";
import { getTasks } from "@/lib/tasks/task-service";
import type { Task } from "@/lib/tasks/task-service";

import { logger } from "@/lib/logger";
// Types
export interface DailySummary {
  id: string;
  tenant_id: string;
  summary_date: string;
  draft_summary: string | null;
  user_corrections: UserCorrection[];
  final_summary: string | null;
  mood_score: number | null;
  energy_score: number | null;
  key_events: KeyEvent[];
  key_topics: string[];
  decisions_made: Decision[];
  tasks_created: number;
  tasks_completed: number;
  message_count: number;
  voice_minutes: number;
  reviewed_at: string | null;
  review_channel: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserCorrection {
  original: string;
  corrected: string;
  type: "correction" | "addition" | "removal";
  timestamp: string;
}

export interface KeyEvent {
  event: string;
  time: string | null;
  sentiment: "positive" | "neutral" | "negative";
  importance: number; // 1-10
}

export interface Decision {
  decision: string;
  context: string | null;
  commitment_level: "definite" | "likely" | "considering";
}

// Admin client for CRON operations
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

/**
 * Get today's messages for a tenant
 */
async function getTodayMessages(
  tenantId: string,
): Promise<
  Array<{ role: string; content: string; channel: string; created_at: string }>
> {
  const supabase = getAdminClient();
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("exo_unified_messages")
    .select("role, content, channel, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", `${today}T00:00:00`)
    .lte("created_at", `${today}T23:59:59`)
    .order("created_at", { ascending: true });

  if (error) {
    logger.error("[DailySummary] Failed to fetch messages:", error);
    return [];
  }

  return data || [];
}

/**
 * Get today's tasks for a tenant
 */
async function getTodayTasks(tenantId: string): Promise<{
  created: number;
  completed: number;
  tasks: Array<{ title: string; status: string }>;
}> {
  const supabase = getAdminClient();
  const today = new Date().toISOString().split("T")[0];
  const todayStart = `${today}T00:00:00`;

  // Fetch all tasks via task-service (dual-read: Tyrolka first, legacy fallback)
  const allTasks = await getTasks(tenantId, undefined, supabase);

  // Tasks created today
  const createdToday = allTasks.filter(
    (t) => t.created_at && t.created_at >= todayStart,
  );

  // Tasks completed today (status "done" — service handles mapping)
  const completedToday = allTasks.filter(
    (t) => t.status === "done" && t.updated_at && t.updated_at >= todayStart,
  );

  return {
    created: createdToday.length,
    completed: completedToday.length,
    tasks: createdToday.map((t) => ({ title: t.title, status: t.status })),
  };
}

/**
 * Generate draft summary using AI
 */
export async function generateDraftSummary(tenantId: string): Promise<{
  draft_summary: string;
  mood_score: number | null;
  energy_score: number | null;
  key_events: KeyEvent[];
  key_topics: string[];
  decisions_made: Decision[];
}> {
  const messages = await getTodayMessages(tenantId);
  const tasks = await getTodayTasks(tenantId);

  if (messages.length === 0) {
    return {
      draft_summary: "Dziś nie było żadnych rozmów.",
      mood_score: null,
      energy_score: null,
      key_events: [],
      key_topics: [],
      decisions_made: [],
    };
  }

  // Format conversation for AI
  const conversationText = messages
    .map(
      (m) =>
        `[${m.created_at.split("T")[1]?.slice(0, 5) || ""}] ${m.role}: ${m.content}`,
    )
    .join("\n");

  // Get tenant info for context
  const supabase = getAdminClient();
  const { data: tenant } = await supabase
    .from("exo_tenants")
    .select("name, assistant_name")
    .eq("id", tenantId)
    .single();

  const userName = tenant?.name || "użytkownik";
  const assistantName = tenant?.assistant_name || "IORS";

  // Generate summary with AI
  const router = getModelRouter();
  const prompt = `Jesteś ${assistantName}, osobistym asystentem ${userName}.

Przeanalizuj dzisiejsze rozmowy i wygeneruj:

1. PODSUMOWANIE DNIA (3-5 zdań, naturalny ton, jakbyś opowiadał przyjacielowi)
2. NASTRÓJ (1-10, gdzie 10 = świetny)
3. ENERGIA (1-10, gdzie 10 = pełen energii)
4. KLUCZOWE WYDARZENIA (max 5, z oceną sentymentu)
5. GŁÓWNE TEMATY (max 5 tagów)
6. DECYZJE/ZOBOWIĄZANIA (jeśli były)

ROZMOWY:
${conversationText}

ZADANIA:
- Utworzone dziś: ${tasks.created}
- Ukończone dziś: ${tasks.completed}
${tasks.tasks.map((t) => `- ${t.title} (${t.status})`).join("\n")}

Odpowiedz w formacie JSON:
{
  "summary": "Podsumowanie dnia...",
  "mood_score": 7,
  "energy_score": 6,
  "key_events": [
    {"event": "Opis wydarzenia", "time": "14:30", "sentiment": "positive", "importance": 8}
  ],
  "key_topics": ["praca", "zdrowie", "spotkania"],
  "decisions": [
    {"decision": "Co postanowił", "context": "W jakim kontekście", "commitment_level": "definite"}
  ]
}`;

  try {
    const response = await router.route({
      messages: [{ role: "user", content: prompt }],
      tenantId,
      taskCategory: "analysis",
      maxTokens: 1500,
    });

    // Parse JSON response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error("[DailySummary] Failed to parse AI response");
      return {
        draft_summary: `Dziś było ${messages.length} wiadomości. Ukończono ${tasks.completed} zadań.`,
        mood_score: null,
        energy_score: null,
        key_events: [],
        key_topics: [],
        decisions_made: [],
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      draft_summary: parsed.summary || "Brak podsumowania",
      mood_score: parsed.mood_score || null,
      energy_score: parsed.energy_score || null,
      key_events: (parsed.key_events || []).map(
        (e: {
          event: string;
          time?: string;
          sentiment?: string;
          importance?: number;
        }) => ({
          event: e.event,
          time: e.time || null,
          sentiment: e.sentiment || "neutral",
          importance: e.importance || 5,
        }),
      ),
      key_topics: parsed.key_topics || [],
      decisions_made: (parsed.decisions || []).map(
        (d: {
          decision: string;
          context?: string;
          commitment_level?: string;
        }) => ({
          decision: d.decision,
          context: d.context || null,
          commitment_level: d.commitment_level || "considering",
        }),
      ),
    };
  } catch (error) {
    logger.error("[DailySummary] AI generation failed:", error);
    return {
      draft_summary: `Dziś było ${messages.length} wiadomości. Ukończono ${tasks.completed} zadań.`,
      mood_score: null,
      energy_score: null,
      key_events: [],
      key_topics: [],
      decisions_made: [],
    };
  }
}

/**
 * Create or update daily summary
 */
export async function createDailySummary(
  tenantId: string,
): Promise<DailySummary | null> {
  const supabase = getAdminClient();
  const today = new Date().toISOString().split("T")[0];

  // Check if summary already exists
  const { data: existing } = await supabase
    .from("exo_daily_summaries")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("summary_date", today)
    .single();

  if (existing?.final_summary) {
    logger.info("[DailySummary] Already finalized for today");
    return existing as DailySummary;
  }

  // Get today's data
  const messages = await getTodayMessages(tenantId);
  const tasks = await getTodayTasks(tenantId);

  // Generate draft summary
  const draft = await generateDraftSummary(tenantId);

  // Calculate voice minutes (approximation: 1 message = 30 seconds)
  const voiceMessages = messages.filter((m) => m.channel === "voice");
  const voiceMinutes = (voiceMessages.length * 0.5) / 60;

  const summaryData = {
    tenant_id: tenantId,
    summary_date: today,
    draft_summary: draft.draft_summary,
    mood_score: draft.mood_score,
    energy_score: draft.energy_score,
    key_events: draft.key_events,
    key_topics: draft.key_topics,
    decisions_made: draft.decisions_made,
    tasks_created: tasks.created,
    tasks_completed: tasks.completed,
    message_count: messages.length,
    voice_minutes: voiceMinutes,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    // Update existing draft
    const { data, error } = await supabase
      .from("exo_daily_summaries")
      .update(summaryData)
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      logger.error("[DailySummary] Update failed:", error);
      return null;
    }
    return data as DailySummary;
  } else {
    // Create new summary
    const { data, error } = await supabase
      .from("exo_daily_summaries")
      .insert(summaryData)
      .select()
      .single();

    if (error) {
      logger.error("[DailySummary] Insert failed:", error);
      return null;
    }
    return data as DailySummary;
  }
}

/**
 * Apply user correction to summary
 */
export async function applyCorrection(
  summaryId: string,
  correction: Omit<UserCorrection, "timestamp">,
): Promise<DailySummary | null> {
  const supabase = getAdminClient();

  // Get current summary
  const { data: current } = await supabase
    .from("exo_daily_summaries")
    .select("*")
    .eq("id", summaryId)
    .single();

  if (!current) {
    logger.error("[DailySummary] Summary not found");
    return null;
  }

  // Add correction
  const corrections: UserCorrection[] = current.user_corrections || [];
  corrections.push({
    ...correction,
    timestamp: new Date().toISOString(),
  });

  // Update summary
  const { data, error } = await supabase
    .from("exo_daily_summaries")
    .update({
      user_corrections: corrections,
      updated_at: new Date().toISOString(),
    })
    .eq("id", summaryId)
    .select()
    .single();

  if (error) {
    logger.error("[DailySummary] Correction failed:", error);
    return null;
  }

  return data as DailySummary;
}

/**
 * Finalize summary (after user review)
 */
export async function finalizeSummary(
  summaryId: string,
  channel: string,
): Promise<DailySummary | null> {
  const supabase = getAdminClient();

  // Get current summary with corrections
  const { data: current } = await supabase
    .from("exo_daily_summaries")
    .select("*")
    .eq("id", summaryId)
    .single();

  if (!current) {
    logger.error("[DailySummary] Summary not found");
    return null;
  }

  // Generate final summary incorporating corrections
  let finalSummary = current.draft_summary || "";
  const corrections: UserCorrection[] = current.user_corrections || [];

  if (corrections.length > 0) {
    // Regenerate with corrections
    const router = getModelRouter();
    const correctionsText = corrections
      .map((c) => {
        if (c.type === "correction") {
          return `- Zmień "${c.original}" na "${c.corrected}"`;
        } else if (c.type === "addition") {
          return `- Dodaj: "${c.corrected}"`;
        } else {
          return `- Usuń: "${c.original}"`;
        }
      })
      .join("\n");

    const prompt = `Popraw podsumowanie dnia na podstawie korekt użytkownika.

ORYGINALNE PODSUMOWANIE:
${current.draft_summary}

KOREKTY UŻYTKOWNIKA:
${correctionsText}

Napisz poprawione podsumowanie (zachowaj styl, uwzględnij wszystkie korekty):`;

    try {
      const response = await router.route({
        messages: [{ role: "user", content: prompt }],
        tenantId: current.tenant_id,
        taskCategory: "summarization",
        maxTokens: 500,
      });
      finalSummary = response.content;
    } catch (error) {
      logger.error("[DailySummary] Finalization AI failed:", error);
      // Fall back to draft with manual corrections
      finalSummary = current.draft_summary || "";
    }
  }

  // Save final summary
  const { data, error } = await supabase
    .from("exo_daily_summaries")
    .update({
      final_summary: finalSummary,
      reviewed_at: new Date().toISOString(),
      review_channel: channel,
      updated_at: new Date().toISOString(),
    })
    .eq("id", summaryId)
    .select()
    .single();

  if (error) {
    logger.error("[DailySummary] Finalization save failed:", error);
    return null;
  }

  return data as DailySummary;
}

/**
 * Get summary for display (to user)
 */
export async function getSummaryForDisplay(
  tenantId: string,
  date?: string,
): Promise<string | null> {
  const supabase = getAdminClient();
  const targetDate = date || new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("exo_daily_summaries")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("summary_date", targetDate)
    .single();

  if (!data) return null;

  const summary = data as DailySummary;
  const text = summary.final_summary || summary.draft_summary;

  if (!text) return null;

  // Format for display
  let display = text;

  if (summary.mood_score) {
    const moodEmoji =
      summary.mood_score >= 7 ? "😊" : summary.mood_score >= 4 ? "😐" : "😔";
    display += `\n\nNastrój: ${moodEmoji} ${summary.mood_score}/10`;
  }

  if (summary.energy_score) {
    const energyEmoji =
      summary.energy_score >= 7
        ? "⚡"
        : summary.energy_score >= 4
          ? "🔋"
          : "🪫";
    display += `\nEnergia: ${energyEmoji} ${summary.energy_score}/10`;
  }

  if (summary.tasks_completed > 0) {
    display += `\n\n✅ Ukończone zadania: ${summary.tasks_completed}`;
  }

  if (!summary.reviewed_at && !date) {
    display += "\n\n💬 Chcesz coś dodać lub poprawić?";
  }

  return display;
}

/**
 * Get recent summaries for context
 */
export async function getRecentSummaries(
  tenantId: string,
  days: number = 7,
): Promise<DailySummary[]> {
  const supabase = getAdminClient();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from("exo_daily_summaries")
    .select("*")
    .eq("tenant_id", tenantId)
    .gte("summary_date", startDate.toISOString().split("T")[0])
    .order("summary_date", { ascending: false });

  if (error) {
    logger.error("[DailySummary] Failed to fetch recent summaries:", error);
    return [];
  }

  return (data || []) as DailySummary[];
}

/**
 * Format summaries as context for AI
 */
export function formatSummariesForPrompt(summaries: DailySummary[]): string {
  if (summaries.length === 0) return "";

  const formatted = summaries
    .slice(0, 7)
    .map((s) => {
      const date = new Date(s.summary_date).toLocaleDateString("pl-PL", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      const text = s.final_summary || s.draft_summary || "Brak danych";
      const mood = s.mood_score ? ` (nastrój: ${s.mood_score}/10)` : "";
      return `${date}${mood}: ${text.slice(0, 200)}...`;
    })
    .join("\n");

  return `### Podsumowania ostatnich dni\n${formatted}`;
}
