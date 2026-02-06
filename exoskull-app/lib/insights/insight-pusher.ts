/**
 * Insight Pusher
 *
 * Queries recent cross-domain insights (correlations, patterns, gaps)
 * from 3 DB sources, formats the top 1-3 via AI (Tier 1 — Gemini Flash),
 * and dispatches to the tenant's preferred channel.
 *
 * Called by the daily /api/cron/insight-push CRON job.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ModelRouter } from "@/lib/ai/model-router";
import {
  dispatchReport,
  type DispatchReportResult,
} from "@/lib/reports/report-dispatcher";

// ============================================================================
// TYPES
// ============================================================================

interface RawInsight {
  id: string;
  sourceTable:
    | "exo_interventions"
    | "user_memory_highlights"
    | "learning_events";
  content: string;
  score: number;
}

export interface InsightPushResult {
  tenantId: string;
  insightsFound: number;
  insightsPushed: number;
  channel: string;
  error?: string;
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

const PRIORITY_SCORES: Record<string, number> = {
  critical: 10,
  high: 8,
  medium: 5,
  low: 2,
};

const MAX_INSIGHTS = 3;
const LOOKBACK_HOURS = 48;

// ============================================================================
// FETCH CANDIDATE INSIGHTS
// ============================================================================

async function fetchCandidateInsights(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<RawInsight[]> {
  const cutoff = new Date(
    Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000,
  ).toISOString();

  // Get already-delivered source IDs
  const { data: delivered } = await supabase
    .from("exo_insight_deliveries")
    .select("source_id, source_table")
    .eq("tenant_id", tenantId);

  const deliveredSet = new Set(
    (delivered || []).map(
      (d: { source_id: string; source_table: string }) =>
        `${d.source_table}:${d.source_id}`,
    ),
  );

  // Run 3 source queries in parallel
  const [interventionsRes, highlightsRes, eventsRes] = await Promise.all([
    supabase
      .from("exo_interventions")
      .select("id, title, description, priority")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .in("intervention_type", [
        "pattern_notification",
        "gap_detection",
        "goal_nudge",
      ])
      .gte("created_at", cutoff),

    supabase
      .from("user_memory_highlights")
      .select("id, content, category, importance")
      .eq("user_id", tenantId)
      .in("category", ["pattern", "insight"])
      .gte("importance", 7)
      .gte("created_at", cutoff),

    supabase
      .from("learning_events")
      .select("id, data")
      .eq("tenant_id", tenantId)
      .eq("event_type", "pattern_detected")
      .gte("created_at", cutoff),
  ]);

  const candidates: RawInsight[] = [];

  // Source 1: Interventions
  for (const i of interventionsRes.data || []) {
    if (deliveredSet.has(`exo_interventions:${i.id}`)) continue;
    candidates.push({
      id: i.id,
      sourceTable: "exo_interventions",
      content: `${i.title}${i.description ? `: ${i.description}` : ""}`,
      score: PRIORITY_SCORES[i.priority] || 5,
    });
  }

  // Source 2: Memory highlights
  for (const h of highlightsRes.data || []) {
    if (deliveredSet.has(`user_memory_highlights:${h.id}`)) continue;
    candidates.push({
      id: h.id,
      sourceTable: "user_memory_highlights",
      content: h.content,
      score: h.importance,
    });
  }

  // Source 3: Learning events
  for (const e of eventsRes.data || []) {
    if (deliveredSet.has(`learning_events:${e.id}`)) continue;
    const data = e.data as Record<string, unknown> | null;
    const desc =
      (data?.description as string) ||
      (data?.synthesis as string) ||
      JSON.stringify(data);
    candidates.push({
      id: e.id,
      sourceTable: "learning_events",
      content: typeof desc === "string" ? desc : JSON.stringify(desc),
      score: 6,
    });
  }

  // Sort by score desc, take top N
  return candidates.sort((a, b) => b.score - a.score).slice(0, MAX_INSIGHTS);
}

// ============================================================================
// FORMAT INSIGHTS WITH AI
// ============================================================================

async function formatInsightsMessage(
  insights: RawInsight[],
  language: string,
  tenantId: string,
): Promise<string> {
  const router = new ModelRouter();
  const isPl = language === "pl";

  const systemPrompt = isPl
    ? `Jestes asystentem ExoSkull. Sformatuj ponizsze 1-${insights.length} spostrzezenia jako krotka, przyjazna wiadomosc poranna.

Zasady:
- Uzyj emoji dla kazdego spostrzezenia (max 1 na poczatku)
- Kazde spostrzezenie: 1-2 zdania, konkretne i uzyteczne
- Ton: cieplu, wspierajacy, bezposredni
- NIE dodawaj wprowadzenia ani zakonczenia — same spostrzezenia
- Jezeli jest wiecej niz 1, oddziel pustym wierszem`
    : `You are ExoSkull assistant. Format the following 1-${insights.length} insights into a short, friendly morning message.

Rules:
- Use one emoji per insight (at the start)
- Each insight: 1-2 sentences, specific and actionable
- Tone: warm, supportive, direct
- Do NOT add intro or outro — just the insights
- If more than 1, separate with blank line`;

  const userContent = insights
    .map((ins, i) => `${i + 1}. ${ins.content}`)
    .join("\n");

  try {
    const response = await router.route({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      taskCategory: "extraction",
      maxTokens: 300,
      temperature: 0.4,
      tenantId,
    });
    return response.content.trim();
  } catch (error) {
    console.error("[InsightPush] AI formatting failed, using raw fallback:", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return insights.map((ins) => `- ${ins.content}`).join("\n\n");
  }
}

// ============================================================================
// RECORD DELIVERIES
// ============================================================================

async function recordDeliveries(
  supabase: SupabaseClient,
  tenantId: string,
  insights: RawInsight[],
  channel: string,
  batchId: string,
): Promise<void> {
  const rows = insights.map((ins) => ({
    tenant_id: tenantId,
    source_table: ins.sourceTable,
    source_id: ins.id,
    channel,
    batch_id: batchId,
  }));

  const { error } = await supabase
    .from("exo_insight_deliveries")
    .upsert(rows, { onConflict: "tenant_id,source_table,source_id" });

  if (error) {
    console.error("[InsightPush] Failed to record deliveries:", {
      tenantId,
      error: error.message,
    });
  }
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

export async function pushInsightsForTenant(
  tenantId: string,
): Promise<InsightPushResult> {
  const supabase = getAdminClient();

  try {
    // 1. Fetch candidates
    const insights = await fetchCandidateInsights(supabase, tenantId);

    if (insights.length === 0) {
      return {
        tenantId,
        insightsFound: 0,
        insightsPushed: 0,
        channel: "none",
      };
    }

    // 2. Get tenant language
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("language")
      .eq("id", tenantId)
      .single();

    const language = tenant?.language || "pl";

    // 3. Format with AI (Tier 1)
    const formattedText = await formatInsightsMessage(
      insights,
      language,
      tenantId,
    );

    // 4. Dispatch via report-dispatcher (multi-channel with fallback)
    const result: DispatchReportResult = await dispatchReport(
      tenantId,
      formattedText,
      "insight",
    );

    // 5. Record deliveries only if dispatch succeeded
    if (result.success) {
      const batchId = crypto.randomUUID();
      await recordDeliveries(
        supabase,
        tenantId,
        insights,
        result.channel,
        batchId,
      );
    }

    return {
      tenantId,
      insightsFound: insights.length,
      insightsPushed: result.success ? insights.length : 0,
      channel: result.channel,
      error: result.error,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[InsightPush] Failed for tenant:", {
      tenantId,
      error: msg,
    });
    return {
      tenantId,
      insightsFound: 0,
      insightsPushed: 0,
      channel: "none",
      error: msg,
    };
  }
}
