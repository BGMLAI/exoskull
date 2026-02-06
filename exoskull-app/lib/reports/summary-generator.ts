/**
 * Report Summary Generator
 *
 * Generates weekly and monthly text summaries from tenant data:
 * - Conversations (count, duration, channel breakdown)
 * - Messages (per channel, inbound vs outbound)
 * - Tasks (created, completed, overdue)
 * - Highlights (top moments from user_memory_highlights)
 * - AI-generated topic summary + personalized insight
 *
 * Uses ModelRouter Tier 1 (extraction) + Tier 2 (summarization) for cost efficiency.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ModelRouter } from "@/lib/ai/model-router";
import { getUserHighlights } from "@/lib/memory/highlights";

// ============================================================================
// TYPES
// ============================================================================

interface ConversationStats {
  total: number;
  totalDurationMinutes: number;
  summaries: string[];
}

interface MessageStats {
  total: number;
  inbound: number;
  outbound: number;
  byChannel: Record<string, number>;
}

interface TaskStats {
  created: number;
  completed: number;
  inProgress: number;
  overdue: number;
}

interface TenantInfo {
  id: string;
  name: string | null;
  language: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function formatDateRange(start: Date, end: Date, language: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const locale = language === "pl" ? "pl-PL" : "en-US";
  return `${start.toLocaleDateString(locale, opts)} - ${end.toLocaleDateString(locale, opts)}`;
}

function formatDuration(minutes: number, language: string): string {
  if (minutes < 60) {
    return language === "pl" ? `${minutes} min` : `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (language === "pl") {
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  }
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// ============================================================================
// DATA QUERIES
// ============================================================================

async function getConversationStats(
  supabase: SupabaseClient,
  tenantId: string,
  since: Date,
  until: Date,
): Promise<ConversationStats> {
  const { data, error } = await supabase
    .from("exo_conversations")
    .select("id, duration_seconds, summary")
    .eq("tenant_id", tenantId)
    .gte("started_at", since.toISOString())
    .lte("started_at", until.toISOString());

  if (error) {
    console.error("[SummaryGenerator] Conversations query failed:", {
      tenantId,
      error: error.message,
    });
    return { total: 0, totalDurationMinutes: 0, summaries: [] };
  }

  const rows = data || [];
  const totalSeconds = rows.reduce(
    (sum, r) => sum + (r.duration_seconds || 0),
    0,
  );

  return {
    total: rows.length,
    totalDurationMinutes: Math.round(totalSeconds / 60),
    summaries: rows.filter((r) => r.summary).map((r) => r.summary as string),
  };
}

async function getMessageStats(
  supabase: SupabaseClient,
  tenantId: string,
  since: Date,
  until: Date,
): Promise<MessageStats> {
  const { data, error } = await supabase
    .from("exo_unified_messages")
    .select("channel, direction")
    .eq("tenant_id", tenantId)
    .gte("created_at", since.toISOString())
    .lte("created_at", until.toISOString());

  if (error) {
    console.error("[SummaryGenerator] Messages query failed:", {
      tenantId,
      error: error.message,
    });
    return { total: 0, inbound: 0, outbound: 0, byChannel: {} };
  }

  const rows = data || [];
  const byChannel: Record<string, number> = {};
  let inbound = 0;
  let outbound = 0;

  for (const row of rows) {
    byChannel[row.channel] = (byChannel[row.channel] || 0) + 1;
    if (row.direction === "inbound") inbound++;
    else if (row.direction === "outbound") outbound++;
  }

  return { total: rows.length, inbound, outbound, byChannel };
}

async function getTaskStats(
  supabase: SupabaseClient,
  tenantId: string,
  since: Date,
  until: Date,
): Promise<TaskStats> {
  // Tasks created in the period
  const { data: created, error: createdErr } = await supabase
    .from("exo_tasks")
    .select("id, status, due_date, completed_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", since.toISOString())
    .lte("created_at", until.toISOString());

  if (createdErr) {
    console.error("[SummaryGenerator] Tasks query failed:", {
      tenantId,
      error: createdErr.message,
    });
    return { created: 0, completed: 0, inProgress: 0, overdue: 0 };
  }

  const rows = created || [];
  const now = new Date();

  return {
    created: rows.length,
    completed: rows.filter((t) => t.status === "done").length,
    inProgress: rows.filter(
      (t) => t.status === "in_progress" || t.status === "pending",
    ).length,
    overdue: rows.filter(
      (t) =>
        t.status !== "done" &&
        t.status !== "cancelled" &&
        t.due_date &&
        new Date(t.due_date) < now,
    ).length,
  };
}

// ============================================================================
// AI SUMMARIZATION
// ============================================================================

async function extractTopics(
  router: ModelRouter,
  summaries: string[],
  language: string,
  tenantId: string,
): Promise<string> {
  if (summaries.length === 0) {
    return language === "pl" ? "Brak rozmów" : "No conversations";
  }

  const prompt =
    language === "pl"
      ? "Wypisz 3-5 głównych tematów rozmów użytkownika. Krótko, po przecinku, bez numeracji."
      : "List 3-5 main topics from the user's conversations. Brief, comma-separated, no numbering.";

  try {
    const response = await router.route({
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: summaries.slice(0, 20).join("\n---\n"),
        },
      ],
      taskCategory: "extraction",
      maxTokens: 200,
      temperature: 0.3,
      tenantId,
    });
    return response.content.trim();
  } catch (error) {
    console.error("[SummaryGenerator] Topic extraction failed:", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return language === "pl"
      ? "Nie udało się wyodrębnić tematów"
      : "Could not extract topics";
  }
}

async function generateInsight(
  router: ModelRouter,
  statsText: string,
  language: string,
  tenantId: string,
): Promise<string> {
  const prompt =
    language === "pl"
      ? "Na podstawie poniższych statystyk, napisz 1-2 zdania spersonalizowanej obserwacji lub rekomendacji dla użytkownika. Bądź konkretny i pomocny."
      : "Based on the stats below, write 1-2 sentences of personalized insight or recommendation. Be specific and helpful.";

  try {
    const response = await router.route({
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: statsText },
      ],
      taskCategory: "summarization",
      maxTokens: 200,
      temperature: 0.5,
      tenantId,
    });
    return response.content.trim();
  } catch (error) {
    console.error("[SummaryGenerator] Insight generation failed:", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}

// ============================================================================
// FORMATTERS
// ============================================================================

function formatChannelBreakdown(
  byChannel: Record<string, number>,
  language: string,
): string {
  const entries = Object.entries(byChannel)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (entries.length === 0) return "";
  return entries.map(([ch, count]) => `${ch}: ${count}`).join(", ");
}

function buildSummaryText(params: {
  period: "weekly" | "monthly";
  dateRange: string;
  language: string;
  conversations: ConversationStats;
  messages: MessageStats;
  tasks: TaskStats;
  highlights: string[];
  topics: string;
  insight: string;
}): string {
  const {
    period,
    dateRange,
    language,
    conversations,
    messages,
    tasks,
    highlights,
    topics,
    insight,
  } = params;
  const pl = language === "pl";

  const header =
    period === "weekly"
      ? pl
        ? `📊 Twój tydzień (${dateRange})`
        : `📊 Your week (${dateRange})`
      : pl
        ? `📊 Twój miesiąc (${dateRange})`
        : `📊 Your month (${dateRange})`;

  const lines: string[] = [header, ""];

  // Conversations
  const channelInfo = formatChannelBreakdown(messages.byChannel, language);
  if (conversations.total > 0) {
    const durationStr = formatDuration(
      conversations.totalDurationMinutes,
      language,
    );
    lines.push(
      pl
        ? `💬 Rozmowy: ${conversations.total} (${durationStr})${channelInfo ? ` — ${channelInfo}` : ""}`
        : `💬 Conversations: ${conversations.total} (${durationStr})${channelInfo ? ` — ${channelInfo}` : ""}`,
    );
  } else {
    lines.push(
      pl
        ? "💬 Rozmowy: brak w tym okresie"
        : "💬 Conversations: none this period",
    );
  }

  // Topics
  if (topics && topics !== (pl ? "Brak rozmów" : "No conversations")) {
    lines.push(pl ? `📝 Tematy: ${topics}` : `📝 Topics: ${topics}`);
  }

  // Messages
  if (messages.total > 0) {
    lines.push(
      pl
        ? `📨 Wiadomości: ${messages.total} (${messages.inbound} przychodzących, ${messages.outbound} wychodzących)`
        : `📨 Messages: ${messages.total} (${messages.inbound} inbound, ${messages.outbound} outbound)`,
    );
  }

  // Tasks
  if (tasks.created > 0) {
    const overdueStr =
      tasks.overdue > 0
        ? pl
          ? `, ${tasks.overdue} przeterminowanych`
          : `, ${tasks.overdue} overdue`
        : "";
    lines.push(
      pl
        ? `✅ Taski: ${tasks.created} utworzonych, ${tasks.completed} ukończonych, ${tasks.inProgress} w toku${overdueStr}`
        : `✅ Tasks: ${tasks.created} created, ${tasks.completed} completed, ${tasks.inProgress} in progress${overdueStr}`,
    );
  }

  // Highlights
  if (highlights.length > 0) {
    lines.push("");
    lines.push(pl ? "🔑 Highlights:" : "🔑 Highlights:");
    for (const h of highlights.slice(0, 3)) {
      lines.push(`  - ${h}`);
    }
  }

  // AI Insight
  if (insight) {
    lines.push("");
    lines.push(`💡 ${pl ? "Insight" : "Insight"}: ${insight}`);
  }

  return lines.join("\n");
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Generate a weekly summary for a tenant (last 7 days).
 */
export async function generateWeeklySummary(tenantId: string): Promise<string> {
  const supabase = getAdminClient();
  const router = new ModelRouter();

  // Get tenant info
  const { data: tenant, error: tenantErr } = await supabase
    .from("exo_tenants")
    .select("id, name, language")
    .eq("id", tenantId)
    .single();

  if (tenantErr || !tenant) {
    console.error("[SummaryGenerator] Tenant not found:", {
      tenantId,
      error: tenantErr?.message,
    });
    return "";
  }

  const info: TenantInfo = {
    id: tenant.id,
    name: tenant.name,
    language: tenant.language || "pl",
  };

  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - 7);

  // Parallel data queries
  const [conversations, messages, tasks, highlightRows] = await Promise.all([
    getConversationStats(supabase, tenantId, since, now),
    getMessageStats(supabase, tenantId, since, now),
    getTaskStats(supabase, tenantId, since, now),
    getUserHighlights(supabase, tenantId, 5),
  ]);

  const highlights = highlightRows.map((h) => h.content);

  // AI calls (sequential — Tier 1 then Tier 2)
  const topics = await extractTopics(
    router,
    conversations.summaries,
    info.language,
    tenantId,
  );

  const statsForInsight = [
    `Conversations: ${conversations.total}`,
    `Messages: ${messages.total} (in: ${messages.inbound}, out: ${messages.outbound})`,
    `Tasks: created=${tasks.created}, done=${tasks.completed}, overdue=${tasks.overdue}`,
    `Topics: ${topics}`,
    highlights.length > 0 ? `Highlights: ${highlights.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const insight = await generateInsight(
    router,
    statsForInsight,
    info.language,
    tenantId,
  );

  return buildSummaryText({
    period: "weekly",
    dateRange: formatDateRange(since, now, info.language),
    language: info.language,
    conversations,
    messages,
    tasks,
    highlights,
    topics,
    insight,
  });
}

/**
 * Generate a monthly summary for a tenant (last 30 days).
 */
export async function generateMonthlySummary(
  tenantId: string,
): Promise<string> {
  const supabase = getAdminClient();
  const router = new ModelRouter();

  const { data: tenant, error: tenantErr } = await supabase
    .from("exo_tenants")
    .select("id, name, language")
    .eq("id", tenantId)
    .single();

  if (tenantErr || !tenant) {
    console.error("[SummaryGenerator] Tenant not found:", {
      tenantId,
      error: tenantErr?.message,
    });
    return "";
  }

  const info: TenantInfo = {
    id: tenant.id,
    name: tenant.name,
    language: tenant.language || "pl",
  };

  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - 30);

  const [conversations, messages, tasks, highlightRows] = await Promise.all([
    getConversationStats(supabase, tenantId, since, now),
    getMessageStats(supabase, tenantId, since, now),
    getTaskStats(supabase, tenantId, since, now),
    getUserHighlights(supabase, tenantId, 10),
  ]);

  const highlights = highlightRows.map((h) => h.content);

  const topics = await extractTopics(
    router,
    conversations.summaries,
    info.language,
    tenantId,
  );

  const statsForInsight = [
    `Period: 30 days`,
    `Conversations: ${conversations.total} (${formatDuration(conversations.totalDurationMinutes, "en")} total)`,
    `Messages: ${messages.total} (in: ${messages.inbound}, out: ${messages.outbound})`,
    `Tasks: created=${tasks.created}, done=${tasks.completed}, overdue=${tasks.overdue}`,
    `Topics: ${topics}`,
    highlights.length > 0 ? `Highlights: ${highlights.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const insight = await generateInsight(
    router,
    statsForInsight,
    info.language,
    tenantId,
  );

  return buildSummaryText({
    period: "monthly",
    dateRange: formatDateRange(since, now, info.language),
    language: info.language,
    conversations,
    messages,
    tasks,
    highlights,
    topics,
    insight,
  });
}
