/**
 * v3 Evening Reflection CRON — runs at 19:00-21:00 UTC
 *
 * Reviews the day: what was achieved, mood, goal progress.
 * Warm, reflective tone. Suggests tomorrow priorities.
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
      .select("id, name, quiet_hours_start, quiet_hours_end")
      .in("subscription_status", ["active", "trialing"]);

    if (!tenants?.length) {
      return NextResponse.json({ message: "No active tenants", results: [] });
    }

    for (const tenant of tenants) {
      try {
        await generateEveningReflection(supabase, tenant.id, tenant.name);
        results.push({ tenantId: tenant.id, status: "sent" });
      } catch (err) {
        console.error(`[Evening] Failed for ${tenant.id}:`, err);
        results.push({ tenantId: tenant.id, status: "error" });
      }
    }

    return NextResponse.json({
      message: "Evening reflection complete",
      results,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function generateEveningReflection(
  supabase: ReturnType<typeof getServiceSupabase>,
  tenantId: string,
  userName: string | null,
) {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const [messagesResult, tasksResult, actionsResult] = await Promise.all([
    supabase
      .from("exo_unified_messages")
      .select("role, content")
      .eq("tenant_id", tenantId)
      .gte("created_at", dayStart.toISOString())
      .limit(50),
    supabase
      .from("user_ops")
      .select("title, status")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .gte("updated_at", dayStart.toISOString())
      .limit(20),
    supabase
      .from("exo_autonomy_log")
      .select("event_type, payload")
      .eq("tenant_id", tenantId)
      .gte("created_at", dayStart.toISOString())
      .limit(20),
  ]);

  const messages = messagesResult.data || [];
  const completedTasks = tasksResult.data || [];
  const actions = actionsResult.data || [];

  // Generate reflection via Haiku
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: anthropicKey });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: `Jesteś wieczorną refleksją ExoSkull. Napisz CIEPŁE podsumowanie dnia (max 5 zdań).
Format: "[co udało się dziś] [postęp celów] [1 sugestia na jutro]"
Styl: ciepły, wspierający, bez presji. Doceniaj wysiłek. Emoji OK.
Imię: ${userName || "szefie"}`,
    messages: [
      {
        role: "user",
        content: `Rozmów: ${messages.length}\nZadania ukończone: ${completedTasks.map((t: { title: string }) => t.title).join(", ") || "brak"}\nAkcje systemu: ${actions.length}\nAkcje: ${
          actions
            .slice(0, 5)
            .map((a: { event_type: string }) => a.event_type)
            .join(", ") || "brak"
        }`,
      },
    ],
  });

  const text = response.content.find((c) => c.type === "text");
  if (!text || !("text" in text)) return;

  await supabase.from("exo_autonomy_log").insert({
    tenant_id: tenantId,
    event_type: "evening_reflection",
    payload: {
      message: text.text,
      conversations: messages.length,
      tasks_completed: completedTasks.length,
      actions_taken: actions.length,
    },
  });

  await supabase.from("exo_unified_messages").insert({
    tenant_id: tenantId,
    role: "assistant",
    content: text.text,
    channel: "autonomous",
    metadata: { type: "evening_reflection" },
  });
}
