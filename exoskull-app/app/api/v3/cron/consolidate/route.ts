/**
 * v3 Nightly Consolidation CRON — runs at 02:00 UTC
 *
 * Reviews all conversations from the day, extracts patterns/preferences/facts,
 * updates organism knowledge (sweet & sour), plans next day priorities.
 *
 * From bgml.ai bible:
 * 1. Review all sessions from the day
 * 2. Extract key information (patterns, preferences, project status)
 * 3. Update knowledge files (organism_knowledge)
 * 4. Re-index (nightly embedding refresh)
 */

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export const maxDuration = 60;

export async function GET(req: Request) {
  // Auth: CRON_SECRET
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const results: { tenantId: string; status: string; details: string }[] = [];

  try {
    // Get all active tenants
    const { data: tenants } = await supabase
      .from("exo_tenants")
      .select("id, name")
      .in("subscription_status", ["active", "trialing", "trial"]);

    if (!tenants?.length) {
      return NextResponse.json({ message: "No active tenants", results: [] });
    }

    for (const tenant of tenants) {
      try {
        await consolidateTenant(supabase, tenant.id);
        results.push({
          tenantId: tenant.id,
          status: "success",
          details: "Consolidated",
        });
      } catch (err) {
        console.error(`[Consolidation] Failed for ${tenant.id}:`, err);
        results.push({
          tenantId: tenant.id,
          status: "error",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({ message: "Consolidation complete", results });
  } catch (err) {
    console.error("[Consolidation] Fatal error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

async function consolidateTenant(
  supabase: ReturnType<typeof getServiceSupabase>,
  tenantId: string,
) {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);

  // 1. Get all messages from today
  const { data: messages } = await supabase
    .from("exo_unified_messages")
    .select("role, content, metadata, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", dayStart.toISOString())
    .order("created_at", { ascending: true })
    .limit(200);

  if (!messages?.length) return; // Nothing to consolidate

  // 2. Get today's autonomy actions
  const { data: actions } = await supabase
    .from("exo_autonomy_log")
    .select("event_type, payload, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", dayStart.toISOString())
    .limit(50);

  // 3. Build summary for AI analysis
  const conversationSummary = messages
    .map(
      (m: { role: string; content: unknown }) =>
        `[${m.role}] ${((m.content as string) || "").slice(0, 300)}`,
    )
    .join("\n");

  const actionsSummary = (actions || [])
    .map(
      (a: { event_type: string; payload: unknown }) =>
        `${a.event_type}: ${(a.payload as Record<string, unknown>)?.description || JSON.stringify(a.payload).slice(0, 200)}`,
    )
    .join("\n");

  // 4. Use AI to extract patterns (Haiku for cost efficiency)
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: anthropicKey });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    system: `Jesteś systemem konsolidacji pamięci ExoSkull. Analizujesz rozmowy i akcje z dnia i wyciągasz wzorce.

Zwróć JSON (i NIC więcej):
{
  "patterns": [{"content": "...", "category": "pattern|preference|anti_pattern|fact", "confidence": 0.0-1.0}],
  "goal_updates": [{"goal_hint": "...", "progress_note": "..."}],
  "tomorrow_priorities": ["..."]
}

Zasady:
- patterns: tylko NOWE odkrycia (nie powtarzaj znanych)
- Sweet: co zadziałało → pattern (confidence 0.7+)
- Sour: co nie zadziałało → anti_pattern (confidence 0.3-0.5)
- Preferencje usera → preference (confidence 0.8+)
- Fakty → fact (confidence 0.9+)
- Max 5 patterns, 3 goal updates, 5 priorities`,
    messages: [
      {
        role: "user",
        content: `Dzisiejsze rozmowy (${messages.length} wiadomości):\n${conversationSummary.slice(0, 6000)}\n\nDzisiejsze akcje autonomii:\n${actionsSummary.slice(0, 2000)}`,
      },
    ],
  });

  const text = response.content.find((c) => c.type === "text");
  if (!text || !("text" in text)) return;

  let parsed: {
    patterns?: { content: string; category: string; confidence: number }[];
    goal_updates?: { goal_hint: string; progress_note: string }[];
    tomorrow_priorities?: string[];
  };

  try {
    parsed = JSON.parse(text.text);
  } catch {
    console.error("[Consolidation] Failed to parse AI response for", tenantId);
    return;
  }

  // 5. Store patterns in organism_knowledge
  if (parsed.patterns?.length) {
    const rows = parsed.patterns.map((p) => ({
      tenant_id: tenantId,
      content: p.content,
      category: p.category || "pattern",
      confidence: p.confidence || 0.5,
      source: "nightly_consolidation",
    }));

    await supabase.from("exo_organism_knowledge").insert(rows);
  }

  // 6. Collect system health metrics for this tenant
  let healthMetrics: Record<string, unknown> = {};
  try {
    // Tool success rate today
    const { data: toolStats } = await supabase
      .from("exo_tool_executions")
      .select("success")
      .eq("tenant_id", tenantId)
      .gte("created_at", dayStart.toISOString());

    const totalTools = toolStats?.length || 0;
    const successTools =
      toolStats?.filter((t: Record<string, unknown>) => t.success).length || 0;

    // Avg response time today
    const { data: usageStats } = await supabase
      .from("exo_ai_usage")
      .select("latency_ms, estimated_cost")
      .eq("tenant_id", tenantId)
      .gte("created_at", dayStart.toISOString());

    const latencies = (usageStats || []).map(
      (u: Record<string, unknown>) => (u.latency_ms as number) || 0,
    );
    const avgLatency =
      latencies.length > 0
        ? latencies.reduce((a: number, b: number) => a + b, 0) /
          latencies.length
        : 0;
    const totalCost = (usageStats || []).reduce(
      (sum: number, u: Record<string, unknown>) =>
        sum + ((u.estimated_cost as number) || 0),
      0,
    );

    healthMetrics = {
      tool_success_rate:
        totalTools > 0 ? Math.round((successTools / totalTools) * 100) : 100,
      total_tool_calls: totalTools,
      avg_response_ms: Math.round(avgLatency),
      daily_cost_usd: Math.round(totalCost * 10000) / 10000,
      total_ai_calls: usageStats?.length || 0,
    };
  } catch {
    // Health metrics are non-critical
  }

  // 7. Log consolidation event with health metrics
  await supabase.from("exo_autonomy_log").insert({
    tenant_id: tenantId,
    event_type: "nightly_consolidation",
    payload: {
      messages_reviewed: messages.length,
      actions_reviewed: actions?.length || 0,
      patterns_extracted: parsed.patterns?.length || 0,
      goal_updates: parsed.goal_updates?.length || 0,
      tomorrow_priorities: parsed.tomorrow_priorities || [],
      health_metrics: healthMetrics,
    },
  });

  // Store health metrics in organism_knowledge for trend analysis
  if (Object.keys(healthMetrics).length > 0) {
    await supabase.from("exo_organism_knowledge").insert({
      tenant_id: tenantId,
      content: `System health ${now.toISOString().split("T")[0]}: ${JSON.stringify(healthMetrics)}`,
      category: "system_metric",
      confidence: 1.0,
      source: "nightly_consolidation",
    });
  }
}
