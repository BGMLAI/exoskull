/**
 * v3 Autonomy Tools — Phase 4
 *
 * 4 tools: enqueue_action, check_permissions, send_notification, log_autonomy
 *
 * These tools let the agent take autonomous actions toward user goals.
 */

import type { V3ToolDefinition } from "./index";

// ============================================================================
// #1 enqueue_action — add to autonomy queue for background execution
// ============================================================================

const enqueueActionTool: V3ToolDefinition = {
  definition: {
    name: "enqueue_action",
    description:
      "Dodaj akcję do kolejki autonomii. System wykona ją w tle (heartbeat). Użyj gdy zadanie wymaga więcej czasu lub powinno być wykonane asynchronicznie.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: [
            "gap",
            "overdue",
            "user_request",
            "heartbeat",
            "self_mod",
            "build_app",
          ],
          description: "Typ akcji",
        },
        description: { type: "string", description: "Co trzeba zrobić" },
        goal_id: {
          type: "string",
          description: "UUID celu powiązanego z akcją",
        },
        priority: { type: "number", description: "Priorytet 1-10" },
        payload: { type: "object", description: "Dodatkowe dane dla akcji" },
      },
      required: ["type", "description"],
    },
  },
  async execute(input, tenantId) {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      const { data, error } = await supabase
        .from("exo_autonomy_queue")
        .insert({
          tenant_id: tenantId,
          type: input.type as string,
          payload: {
            description: input.description as string,
            goal_id: input.goal_id || null,
            ...((input.payload as Record<string, unknown>) || {}),
          },
          priority: (input.priority as number) || 5,
          source: "agent",
        })
        .select("id")
        .single();

      if (error) return `Błąd: ${error.message}`;
      return `🔄 Dodano do kolejki: "${(input.description as string).slice(0, 80)}" (ID: ${data.id}). Heartbeat wykona przy najbliższej iteracji.`;
    } catch (err) {
      return `Błąd: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// #2 check_permissions — check what the agent is allowed to do autonomously
// ============================================================================

const checkPermissionsTool: V3ToolDefinition = {
  definition: {
    name: "check_permissions",
    description:
      "Sprawdź jakie uprawnienia ma agent dla tego użytkownika. 3 poziomy: autonomous (rób sam), ask_first (pytaj), manual (nie rób).",
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description:
            "Konkretna akcja do sprawdzenia (np. 'send_email', 'make_call', 'deploy_app')",
        },
      },
      required: [],
    },
  },
  async execute(input, tenantId) {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      const { data } = await supabase
        .from("exo_tenants")
        .select("permission_level, metadata")
        .eq("id", tenantId)
        .single();

      const level = data?.permission_level || "ask_first";
      const meta = (data?.metadata as Record<string, unknown>) || {};
      const grants = (meta.autonomy_grants as Record<string, string>) || {};

      if (input.action) {
        const actionLevel = grants[input.action as string] || level;
        return `Uprawnienie dla "${input.action}": ${actionLevel}\n\nPoziom globalny: ${level}\nGranty: ${
          Object.entries(grants)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ") || "brak"
        }`;
      }

      return `Poziom autonomii: ${level}\n\nGranularne uprawnienia:\n${
        Object.entries(grants)
          .map(([k, v]) => `  ${k}: ${v}`)
          .join("\n") || "  (brak — użyj poziomu globalnego)"
      }`;
    } catch (err) {
      return `Błąd: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// #3 send_notification — notify user about progress/actions
// ============================================================================

const sendNotificationTool: V3ToolDefinition = {
  definition: {
    name: "send_notification",
    description:
      "Wyślij powiadomienie użytkownikowi (SMS, email, Telegram). Użyj po wykonaniu autonomicznej akcji — ZAWSZE informuj co zrobiłeś.",
    input_schema: {
      type: "object" as const,
      properties: {
        message: { type: "string", description: "Treść powiadomienia" },
        channel: {
          type: "string",
          enum: ["sms", "email", "telegram", "push"],
          description: "Kanał (default: preferred_channel z profilu)",
        },
        urgency: {
          type: "string",
          enum: ["low", "normal", "high"],
          description: "Pilność — high = natychmiast, low = batch z innymi",
        },
      },
      required: ["message"],
    },
  },
  async execute(input, tenantId) {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      // Get preferred channel
      const { data: tenant } = await supabase
        .from("exo_tenants")
        .select("preferred_channel, phone, metadata")
        .eq("id", tenantId)
        .single();

      const channel =
        (input.channel as string) || tenant?.preferred_channel || "push";

      // Log the notification attempt
      await supabase.from("exo_autonomy_log").insert({
        tenant_id: tenantId,
        event_type: "notification_sent",
        payload: {
          channel,
          message: (input.message as string).slice(0, 500),
          urgency: input.urgency || "normal",
        },
      });

      // For now, store notification. Real channels (SMS/Telegram) wired in Phase 6
      if (channel === "sms" && tenant?.phone) {
        // TODO Phase 6: Twilio SMS
        return `📱 Powiadomienie SMS przygotowane (będzie wysłane po wdrożeniu Phase 6): "${(input.message as string).slice(0, 160)}"`;
      }

      return `🔔 Powiadomienie zapisane (${channel}): "${(input.message as string).slice(0, 200)}"`;
    } catch (err) {
      return `Błąd: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// #4 log_autonomy — log what the agent did (audit trail)
// ============================================================================

const logAutonomyTool: V3ToolDefinition = {
  definition: {
    name: "log_autonomy",
    description:
      "Zaloguj autonomiczną akcję do audytu. ZAWSZE loguj po podjęciu akcji bez polecenia użytkownika.",
    input_schema: {
      type: "object" as const,
      properties: {
        event_type: {
          type: "string",
          description:
            "Typ zdarzenia (np. 'goal_progress', 'task_completed', 'app_built', 'call_made')",
        },
        description: { type: "string", description: "Co zostało zrobione" },
        goal_id: { type: "string", description: "UUID celu powiązanego" },
        queue_item_id: {
          type: "string",
          description: "UUID elementu z kolejki (jeśli dotyczy)",
        },
        result: {
          type: "string",
          enum: ["success", "partial", "failed"],
          description: "Wynik akcji",
        },
      },
      required: ["event_type", "description"],
    },
  },
  async execute(input, tenantId) {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      const { error } = await supabase.from("exo_autonomy_log").insert({
        tenant_id: tenantId,
        event_type: input.event_type as string,
        queue_item_id: (input.queue_item_id as string) || null,
        payload: {
          description: input.description as string,
          goal_id: input.goal_id || null,
          result: input.result || "success",
          timestamp: new Date().toISOString(),
        },
      });

      if (error) return `Błąd logowania: ${error.message}`;
      return `📝 Zalogowano: ${input.event_type} — "${(input.description as string).slice(0, 100)}" [${input.result || "success"}]`;
    } catch (err) {
      return `Błąd: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// #5 get_autonomy_log — retrieve history of autonomous actions
// ============================================================================

const getAutonomyLogTool: V3ToolDefinition = {
  definition: {
    name: "get_autonomy_log",
    description:
      "Pokaż historię autonomicznych akcji systemu. Co ExoSkull robił samodzielnie: emaile, zadania, cele, budowanie app.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Ile wyników (domyślnie 15)" },
        event_type: {
          type: "string",
          description:
            "Filtruj po typie (np. 'email_sent', 'app_built', 'goal_progress', 'morning_briefing')",
        },
        hours_ago: {
          type: "number",
          description: "Ostatnie N godzin (domyślnie 24)",
        },
      },
      required: [],
    },
  },
  async execute(input, tenantId) {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      const hoursAgo = (input.hours_ago as number) || 24;
      const since = new Date(
        Date.now() - hoursAgo * 60 * 60 * 1000,
      ).toISOString();

      let query = supabase
        .from("exo_autonomy_log")
        .select("event_type, payload, created_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit((input.limit as number) || 15);

      if (input.event_type) {
        query = query.eq("event_type", input.event_type as string);
      }

      const { data, error } = await query;
      if (error) return `Błąd: ${error.message}`;
      if (!data?.length)
        return `Brak autonomicznych akcji w ostatnich ${hoursAgo}h.`;

      let output = `📋 **Log autonomii** (ostatnie ${hoursAgo}h, ${data.length} akcji):\n\n`;
      for (const entry of data) {
        const payload = (entry.payload as Record<string, unknown>) || {};
        const time = new Date(entry.created_at).toLocaleTimeString("pl-PL", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const desc =
          (payload.description as string) ||
          (payload.message as string) ||
          JSON.stringify(payload).slice(0, 100);
        output += `[${time}] **${entry.event_type}** — ${desc}\n`;
      }

      return output;
    } catch (err) {
      return `Błąd: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// EXPORT
// ============================================================================

export const autonomyTools: V3ToolDefinition[] = [
  enqueueActionTool,
  checkPermissionsTool,
  sendNotificationTool,
  logAutonomyTool,
  getAutonomyLogTool,
];
