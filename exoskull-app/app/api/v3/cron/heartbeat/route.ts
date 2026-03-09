/**
 * v3 Heartbeat CRON — Goal-Driven Autonomy Loop (every 15 min)
 *
 * The ONE loop that makes ExoSkull autonomous.
 * Observe → Plan → Act → Verify → Learn
 *
 * For EACH active goal:
 * - Is it progressing?
 * - What's blocking it?
 * - What can I do RIGHT NOW?
 *
 * Then executes the highest-impact action.
 */

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const results: { tenantId: string; action: string; status: string }[] = [];

  try {
    // Get active tenants with autonomous permission
    const { data: tenants, error: tenantsError } = await supabase
      .from("exo_tenants")
      .select(
        "id, name, permission_level, quiet_hours_start, quiet_hours_end, preferred_channel, metadata",
      )
      .in("subscription_status", ["active", "trialing", "trial"]);

    if (tenantsError) {
      console.error("[Heartbeat] Failed to fetch tenants:", {
        error: tenantsError,
      });
      return NextResponse.json(
        { error: "Failed to fetch tenants" },
        { status: 500 },
      );
    }

    if (!tenants?.length) {
      return NextResponse.json({ message: "No active tenants", results: [] });
    }

    for (const tenant of tenants) {
      // Skip if in quiet hours
      if (isQuietHours(tenant.quiet_hours_start, tenant.quiet_hours_end))
        continue;

      // Skip if permission is manual or NULL (no autonomy for new/unset tenants)
      if (!tenant.permission_level || tenant.permission_level === "manual")
        continue;

      try {
        const action = await heartbeatForTenant(
          supabase,
          tenant.id,
          (tenant.metadata as Record<string, unknown>) || {},
        );
        results.push({
          tenantId: tenant.id,
          action: action || "no_action",
          status: "ok",
        });
      } catch (err) {
        console.error(`[Heartbeat] Failed for ${tenant.id}:`, err);
        results.push({
          tenantId: tenant.id,
          action: "error",
          status: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({ message: "Heartbeat complete", results });
  } catch (err) {
    console.error("[Heartbeat] Fatal:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

function isQuietHours(start: number | null, end: number | null): boolean {
  if (start == null || end == null) return false;
  const hour = new Date().getUTCHours();
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

async function heartbeatForTenant(
  supabase: ReturnType<typeof getServiceSupabase>,
  tenantId: string,
  tenantMetadata?: Record<string, unknown>,
): Promise<string | null> {
  // === STEP 1: OBSERVE — Check goals, queue, recent activity ===

  const [goalsResult, queueResult, recentActionsResult] = await Promise.all<{
    data: unknown[] | null;
    error: unknown;
  }>([
    // Graph DB: goals are nodes with type='goal'
    supabase
      .from("nodes")
      .select("id, name, status, metadata")
      .eq("tenant_id", tenantId)
      .eq("type", "goal")
      .in("status", ["active", "pending"])
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("exo_autonomy_queue")
      .select("id, type, payload, priority, retry_count, max_retries")
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .order("priority", { ascending: false })
      .limit(5),
    supabase
      .from("exo_autonomy_log")
      .select("event_type, payload, created_at")
      .eq("tenant_id", tenantId)
      .gte(
        "created_at",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      )
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (goalsResult.error)
    console.error(
      `[Heartbeat] Goals query failed for ${tenantId}:`,
      goalsResult.error,
    );
  if (queueResult.error)
    console.error(
      `[Heartbeat] Queue query failed for ${tenantId}:`,
      queueResult.error,
    );
  if (recentActionsResult.error)
    console.error(
      `[Heartbeat] Recent actions query failed for ${tenantId}:`,
      recentActionsResult.error,
    );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const goals = ((goalsResult.data || []) as any[]).map((g) => ({
    id: g.id as string,
    title: (g.name || g.title) as string,
    priority: (g.metadata?.priority as number) || 5,
    metadata: g.metadata,
  }));
  const queue = (queueResult.data || []) as {
    id: string;
    type: string;
    payload: unknown;
    priority: number;
    retry_count: number;
    max_retries: number;
  }[];
  const recentActions = (recentActionsResult.data || []) as {
    event_type: string;
    payload: unknown;
    created_at: string;
  }[];

  // Nothing to do
  if (!goals.length && !queue.length) return null;

  // === STEP 2: DECIDE — What's the highest-impact action? ===

  // Priority 1: Process queued items (user requests)
  if (queue.length > 0) {
    const item = queue[0];
    return processQueueItem(supabase, tenantId, item);
  }

  // Priority 2: Check goal progress and take proactive action
  if (goals.length > 0) {
    return evaluateGoals(
      supabase,
      tenantId,
      goals,
      recentActions,
      tenantMetadata,
    );
  }

  return null;
}

async function processQueueItem(
  supabase: ReturnType<typeof getServiceSupabase>,
  tenantId: string,
  item: {
    id: string;
    type: string;
    payload: unknown;
    priority: number;
    retry_count: number;
    max_retries: number;
  },
): Promise<string> {
  // Claim the item atomically
  const { error: claimError } = await supabase
    .from("exo_autonomy_queue")
    .update({ status: "processing", claimed_at: new Date().toISOString() })
    .eq("id", item.id)
    .eq("status", "pending");

  if (claimError) return "claim_failed";

  try {
    // Execute via v3 agent in autonomous mode
    const { runV3Agent } = await import("@/lib/v3/agent");
    const payload = item.payload as Record<string, unknown>;
    const description =
      (payload?.description as string) || JSON.stringify(payload).slice(0, 200);

    const result = await runV3Agent({
      tenantId,
      sessionId: `heartbeat-${item.id}`,
      userMessage: `[AUTONOMY] Wykonaj zadanie: ${description}`,
      channel: "autonomous",
      mode: "autonomous",
      timeoutMs: 45_000,
    });

    // Mark as completed
    await supabase
      .from("exo_autonomy_queue")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        result: {
          response: result.text?.slice(0, 2000),
          tools_used: result.toolsUsed?.length || 0,
        },
      })
      .eq("id", item.id);

    // Log
    await supabase.from("exo_autonomy_log").insert({
      tenant_id: tenantId,
      event_type: "queue_item_processed",
      queue_item_id: item.id,
      payload: { type: item.type, description, status: "success" },
    });

    return `processed:${item.type}`;
  } catch (err) {
    // Retry or fail
    const retries = item.retry_count + 1;
    await supabase
      .from("exo_autonomy_queue")
      .update({
        status: retries >= item.max_retries ? "failed" : "pending",
        retry_count: retries,
        error_log: [
          `${new Date().toISOString()}: ${err instanceof Error ? err.message : String(err)}`,
        ],
      })
      .eq("id", item.id);

    return `failed:${item.type}`;
  }
}

async function evaluateGoals(
  supabase: ReturnType<typeof getServiceSupabase>,
  tenantId: string,
  goals: { id: string; title: string; priority: number; metadata: unknown }[],
  recentActions: { event_type: string; payload: unknown; created_at: string }[],
  tenantMetadata?: Record<string, unknown>,
): Promise<string | null> {
  // Rate limit: configurable per tenant, default 12 proactive actions per day
  const maxDaily = (tenantMetadata?.max_daily_autonomy_actions as number) || 12;
  const todayActions = recentActions.filter(
    (a) => a.event_type === "proactive_action",
  );
  if (todayActions.length >= maxDaily) return "rate_limited";

  // Use Haiku to decide what to do (cheap)
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return null;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: anthropicKey });

  const goalsContext = goals
    .map((g) => {
      const meta = (g.metadata as Record<string, unknown>) || {};
      return `- ${g.title} (priorytet: ${g.priority}, postęp: ${meta.progress || 0}%)`;
    })
    .join("\n");

  const actionsContext = recentActions
    .slice(0, 5)
    .map((a) => `- ${a.event_type}: ${JSON.stringify(a.payload).slice(0, 100)}`)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: `Jesteś heartbeat systemu ExoSkull. Twoim jedynym celem jest REALIZOWAĆ cele użytkownika.

Zdecyduj: jaka JEDNA akcja NAJBARDZIEJ przybliży najważniejszy cel?

Zwróć JSON:
{"action": "none|enqueue|notify", "goal_id": "...", "description": "co zrobić", "reason": "dlaczego"}

Zasady:
- "none" jeśli nie ma co robić teraz
- "enqueue" jeśli wymaga pracy w tle (budowanie, research, pisanie)
- "notify" jeśli użytkownik powinien coś wiedzieć lub zrobić
- Preferuj DZIAŁANIE nad analizą
- NIE powtarzaj niedawnych akcji`,
    messages: [
      {
        role: "user",
        content: `Cele użytkownika:\n${goalsContext}\n\nOstatnie akcje:\n${actionsContext || "brak"}`,
      },
    ],
  });

  const text = response.content.find((c) => c.type === "text");
  if (!text || !("text" in text)) return null;

  let decision: {
    action: string;
    goal_id?: string;
    description?: string;
    reason?: string;
  };
  try {
    decision = JSON.parse(text.text);
  } catch {
    return null;
  }

  if (decision.action === "none") return null;

  if (decision.action === "enqueue" && decision.description) {
    await supabase.from("exo_autonomy_queue").insert({
      tenant_id: tenantId,
      type: "heartbeat",
      payload: {
        description: decision.description,
        goal_id: decision.goal_id || null,
        reason: decision.reason || null,
      },
      priority: 5,
      source: "heartbeat",
    });
  }

  // Log proactive action
  await supabase.from("exo_autonomy_log").insert({
    tenant_id: tenantId,
    event_type: "proactive_action",
    payload: decision,
  });

  return `proactive:${decision.action}`;
}
