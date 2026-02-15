/**
 * IORS Planning Tools
 *
 * Tools for planning and delegating actions via conversation.
 * - plan_action: Schedule a future action
 * - list_planned_actions: Show pending actions
 * - cancel_planned_action: Cancel a planned action
 * - delegate_complex_task: Delegate a complex task for background processing
 * - async_think: Queue deep analysis for later delivery
 */

import type { ToolDefinition } from "./index";
import { getServiceSupabase } from "@/lib/supabase/service";
import { createTask } from "@/lib/async-tasks/queue";
import { emitEvent } from "@/lib/iors/loop";

export const planningTools: ToolDefinition[] = [
  {
    definition: {
      name: "plan_action",
      description:
        "Zaplanuj akcję do wykonania w przyszłości. Akcja zostanie wykonana automatycznie po upływie timeout (domyślnie 1h) jeżeli user nie wyrazi sprzeciwu. Użyj gdy chcesz coś zrobić ale chcesz dać userowi szansę na anulowanie.",
      input_schema: {
        type: "object" as const,
        properties: {
          action_type: {
            type: "string",
            enum: [
              "send_sms",
              "send_email",
              "send_whatsapp",
              "make_call",
              "create_task",
            ],
            description: "Typ akcji do wykonania",
          },
          title: {
            type: "string",
            description: "Krótki opis akcji (widoczny dla usera)",
          },
          action_payload: {
            type: "object",
            description:
              "Parametry akcji (phone, message, email, subject, body, title, etc.)",
          },
          timeout_hours: {
            type: "number",
            description: "Ile godzin czekać na sprzeciw (domyślnie 1)",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Priorytet (domyślnie medium)",
          },
        },
        required: ["action_type", "title", "action_payload"],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const actionType = input.action_type as string;
      const title = input.title as string;
      const actionPayload = input.action_payload as Record<string, unknown>;
      const timeoutHours = (input.timeout_hours as number) || 1;
      const priority = (input.priority as string) || "medium";

      const scheduledFor = new Date(
        Date.now() + timeoutHours * 60 * 60 * 1000,
      ).toISOString();

      const { error: planError } = await supabase.rpc("propose_intervention", {
        p_tenant_id: tenantId,
        p_type:
          actionType === "create_task" ? "task_creation" : "automation_trigger",
        p_title: title,
        p_description: `Zaplanowana akcja: ${actionType}`,
        p_action_payload: { action: actionType, ...actionPayload },
        p_priority: priority,
        p_source_agent: "IORS",
        p_requires_approval: true,
        p_scheduled_for: scheduledFor,
      });

      if (planError) {
        console.error("[PlanningTools] plan_action error:", {
          code: planError.code,
          message: planError.message,
          details: planError.details,
          tenantId,
          actionType,
        });
        const reason =
          planError.code === "PGRST301"
            ? "brak uprawnień"
            : planError.code === "23503"
              ? "nieprawidłowy typ akcji"
              : planError.message;
        return `Nie udało się zaplanować akcji (${reason}). Spróbuj ponownie.`;
      }

      // Emit outbound_ready event for Pętla loop
      emitEvent({
        tenantId,
        eventType: "outbound_ready",
        priority: 2,
        source: "plan_action",
        payload: { action_type: actionType, title, priority, scheduledFor },
        dedupKey: `plan:${tenantId}:${actionType}:${new Date().toISOString().slice(0, 13)}`,
      }).catch((err) =>
        console.error("[PlanningTools] emitEvent failed:", err),
      );

      return `Zaplanowano: "${title}". Wykonam za ${timeoutHours}h jeśli nie anulujesz.`;
    },
  },
  {
    definition: {
      name: "list_planned_actions",
      description: "Pokaż zaplanowane akcje czekające na wykonanie.",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    execute: async (_input, tenantId) => {
      const supabase = getServiceSupabase();
      const { data: pending } = await supabase.rpc(
        "get_pending_interventions",
        {
          p_tenant_id: tenantId,
          p_limit: 10,
        },
      );

      if (!pending?.length) {
        return "Brak zaplanowanych akcji.";
      }

      return pending
        .map(
          (p: { title: string; priority: string; scheduled_for: string }) => {
            const when = p.scheduled_for
              ? new Date(p.scheduled_for).toLocaleString("pl-PL", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "2-digit",
                  month: "2-digit",
                })
              : "wkrótce";
            return `• ${p.title} [${p.priority}] - ${when}`;
          },
        )
        .join("\n");
    },
  },
  {
    definition: {
      name: "cancel_planned_action",
      description: "Anuluj zaplanowaną akcję.",
      input_schema: {
        type: "object" as const,
        properties: {
          action_title: {
            type: "string",
            description: "Tytuł akcji do anulowania (dopasowanie częściowe)",
          },
        },
        required: ["action_title"],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const searchTitle = input.action_title as string;

      const { data: pending } = await supabase
        .from("exo_interventions")
        .select("id, title")
        .eq("tenant_id", tenantId)
        .eq("status", "proposed")
        .ilike("title", `%${searchTitle}%`)
        .limit(1);

      if (!pending?.length) {
        return `Nie znaleziono zaplanowanej akcji "${searchTitle}"`;
      }

      await supabase
        .from("exo_interventions")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", pending[0].id);

      return `Anulowano: "${pending[0].title}"`;
    },
  },
  {
    definition: {
      name: "delegate_complex_task",
      description:
        'Deleguj złożony task do wykonania w tle. Użyj gdy zadanie wymaga wielu kroków lub długiego przetwarzania. Odpowiedz userowi krótko "Zajmę się tym" i deleguj.',
      input_schema: {
        type: "object" as const,
        properties: {
          task_description: {
            type: "string",
            description: "Opis zadania do wykonania",
          },
          steps: {
            type: "array",
            items: { type: "string" },
            description: "Kroki do wykonania (opcjonalne)",
          },
        },
        required: ["task_description"],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const taskDescription = input.task_description as string;
      const steps = (input.steps as string[]) || [];

      const { error: delegateError } = await supabase.rpc(
        "propose_intervention",
        {
          p_tenant_id: tenantId,
          p_type: "automation_trigger",
          p_title: `[Delegowany] ${taskDescription}`,
          p_description:
            steps.length > 0 ? `Kroki: ${steps.join(", ")}` : taskDescription,
          p_action_payload: {
            action: "delegated_task",
            task_description: taskDescription,
            steps,
          },
          p_priority: "medium",
          p_source_agent: "IORS",
          p_requires_approval: false,
          p_scheduled_for: null,
        },
      );

      if (delegateError) {
        console.error("[PlanningTools] delegate error:", delegateError);
        return `Nie udało się delegować zadania`;
      }

      return `Zajmę się tym w tle. Dam znać jak skończę.`;
    },
  },
  {
    definition: {
      name: "async_think",
      description:
        'Odłóż głęboką analizę do przetwarzania w tle. Użyj gdy user zadaje pytanie wymagające rozległej analizy, wielu źródeł danych, lub głębokiego namysłu. Odpowiedz "Muszę nad tym pomyśleć" i zleć analizę do async queue.',
      input_schema: {
        type: "object" as const,
        properties: {
          question: {
            type: "string",
            description: "Pytanie lub temat do głębokiej analizy",
          },
          context: {
            type: "string",
            description: "Dodatkowy kontekst zebrany z rozmowy (opcjonalny)",
          },
        },
        required: ["question"],
      },
    },
    execute: async (input, tenantId) => {
      const question = input.question as string;
      const context = (input.context as string) || "";

      try {
        // Get user's preferred channel for delivery
        const supabase = getServiceSupabase();
        const { data: tenant } = await supabase
          .from("exo_tenants")
          .select("preferred_channel")
          .eq("id", tenantId)
          .single();

        const replyChannel = tenant?.preferred_channel || "web_chat";

        const prompt = context
          ? `[DEEP ANALYSIS REQUEST]\nPytanie: ${question}\nKontekst: ${context}\n\nPrzeanalizuj to głęboko i odpowiedz wyczerpująco.`
          : `[DEEP ANALYSIS REQUEST]\nPytanie: ${question}\n\nPrzeanalizuj to głęboko i odpowiedz wyczerpująco.`;

        await createTask({
          tenantId,
          channel: replyChannel,
          channelMetadata: {},
          replyTo: replyChannel,
          prompt,
        });

        return `Myślę nad tym. Odpowiedź wyślę na ${replyChannel} gdy będzie gotowa.`;
      } catch (error) {
        console.error("[PlanningTools] async_think error:", {
          tenantId,
          error: error instanceof Error ? error.message : error,
        });
        return `Nie udało się zakolejkować analizy. Spróbuję odpowiedzieć teraz.`;
      }
    },
  },
];
