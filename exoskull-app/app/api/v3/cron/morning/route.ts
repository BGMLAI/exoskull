/**
 * v3 Morning Briefing CRON — runs at 05:00-07:00 UTC (per user timezone)
 *
 * Goal-driven: reviews active goals, yesterday's progress, today's plan.
 * Sends SMS/push with actionable morning briefing.
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
  const results: { tenantId: string; status: string }[] = [];

  try {
    const { data: tenants } = await supabase
      .from("exo_tenants")
      .select("id, name, preferred_channel, quiet_hours_start, quiet_hours_end")
      .eq("active", true);

    if (!tenants?.length) {
      return NextResponse.json({ message: "No active tenants", results: [] });
    }

    for (const tenant of tenants) {
      // Respect quiet hours
      const hour = new Date().getUTCHours();
      if (tenant.quiet_hours_start != null && tenant.quiet_hours_end != null) {
        const start = tenant.quiet_hours_start as number;
        const end = tenant.quiet_hours_end as number;
        const inQuiet =
          start < end
            ? hour >= start && hour < end
            : hour >= start || hour < end;
        if (inQuiet) continue;
      }

      try {
        await generateMorningBriefing(supabase, tenant.id, tenant.name);
        results.push({ tenantId: tenant.id, status: "sent" });
      } catch (err) {
        console.error(`[Morning] Failed for ${tenant.id}:`, err);
        results.push({ tenantId: tenant.id, status: "error" });
      }
    }

    return NextResponse.json({ message: "Morning briefing complete", results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function generateMorningBriefing(
  supabase: ReturnType<typeof getServiceSupabase>,
  tenantId: string,
  userName: string | null,
) {
  // Gather context: goals, tasks, yesterday's actions
  const [goalsResult, tasksResult, actionsResult] = await Promise.all([
    supabase
      .from("user_loops")
      .select("title, priority, status, metadata")
      .eq("tenant_id", tenantId)
      .eq("type", "goal")
      .in("status", ["active", "pending"])
      .order("priority", { ascending: false })
      .limit(5),
    supabase
      .from("user_ops")
      .select("title, priority, status, metadata")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "active"])
      .order("priority", { ascending: false })
      .limit(10),
    supabase
      .from("exo_autonomy_log")
      .select("event_type, payload")
      .eq("tenant_id", tenantId)
      .gte(
        "created_at",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      )
      .limit(10),
  ]);

  const goals = goalsResult.data || [];
  const tasks = tasksResult.data || [];
  const actions = actionsResult.data || [];

  if (!goals.length && !tasks.length) return; // Nothing to brief about

  // Generate briefing via Haiku (cheap)
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: anthropicKey });

  const goalsCtx = goals
    .map((g: { title: string; priority: number; metadata: unknown }) => {
      const meta = (g.metadata as Record<string, unknown>) || {};
      return `- ${g.title} (${meta.progress || 0}%, priorytet ${g.priority})`;
    })
    .join("\n");

  const tasksCtx = tasks
    .map((t: { title: string; status: string }) => `- [${t.status}] ${t.title}`)
    .join("\n");

  const actionsCtx = actions
    .map((a: { event_type: string; payload: unknown }) => {
      const p = a.payload as Record<string, unknown>;
      return `- ${a.event_type}: ${(p?.description as string) || JSON.stringify(p).slice(0, 100)}`;
    })
    .join("\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: `Jesteś morning briefing systemu ExoSkull. Napisz KRÓTKI (max 5 zdań) poranny briefing po polsku.
Format: "Dobry, ${userName || "szefie"}! [cele na dziś] [co zrobił system w nocy] [1 priorytet na dziś]"
Styl: ciepły ale konkretny. Zero puchu. Emoji OK.`,
    messages: [
      {
        role: "user",
        content: `Cele:\n${goalsCtx || "brak"}\n\nZadania:\n${tasksCtx || "brak"}\n\nAkcje systemu (24h):\n${actionsCtx || "brak"}`,
      },
    ],
  });

  const text = response.content.find((c) => c.type === "text");
  if (!text || !("text" in text)) return;

  // Store briefing + send notification
  await supabase.from("exo_autonomy_log").insert({
    tenant_id: tenantId,
    event_type: "morning_briefing",
    payload: {
      message: text.text,
      goals_count: goals.length,
      tasks_count: tasks.length,
    },
  });

  // Store as message in thread for context
  await supabase.from("exo_unified_messages").insert({
    tenant_id: tenantId,
    role: "assistant",
    content: text.text,
    channel: "autonomous",
    metadata: { type: "morning_briefing" },
  });
}
