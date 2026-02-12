/**
 * Native Tyrolka Framework IORS Tools
 *
 * Direct access to Tyrolka tables (user_ops, user_quests, user_loops, user_campaigns).
 * Gated by quest_system_enabled feature flag.
 * These provide richer capabilities than the legacy task tools.
 */

import type { ToolDefinition } from "./index";
import { getServiceSupabase } from "@/lib/supabase/service";

async function isQuestSystemEnabled(tenantId: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("exo_tenants")
    .select("iors_behavior_presets")
    .eq("id", tenantId)
    .single();

  if (!data) return false;
  const presets = data.iors_behavior_presets as Record<string, unknown> | null;
  return presets?.quest_system_enabled === true;
}

export const tyrolkaTools: ToolDefinition[] = [
  {
    definition: {
      name: "create_op",
      description:
        "Stwórz nowe zadanie (Op) w systemie Tyrolka. Bogate opcje: tagi, powiązanie z questem, priorytet 1-10.",
      input_schema: {
        type: "object" as const,
        properties: {
          title: { type: "string", description: "Tytuł zadania" },
          description: {
            type: "string",
            description: "Opis zadania (opcjonalny)",
          },
          quest_id: {
            type: "string",
            description: "ID questa do powiązania (opcjonalny)",
          },
          loop_slug: {
            type: "string",
            description:
              "Slug pętli: health, productivity, finance, mental, social, learning, creativity",
          },
          priority: {
            type: "number",
            description: "Priorytet 1-10 (10=najwyższy, 1=najniższy)",
            default: 5,
          },
          due_date: {
            type: "string",
            description: "Termin YYYY-MM-DD (opcjonalny)",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tagi: np. ['sport', 'poranny']",
          },
        },
        required: ["title"],
      },
    },
    execute: async (input, tenantId) => {
      if (!(await isQuestSystemEnabled(tenantId))) {
        return "System Tyrolka nie jest jeszcze aktywny. Użyj add_task zamiast tego.";
      }

      const supabase = getServiceSupabase();
      const { data, error } = await supabase
        .from("user_ops")
        .insert({
          tenant_id: tenantId,
          title: input.title as string,
          description: (input.description as string) || null,
          quest_id: (input.quest_id as string) || null,
          loop_slug: (input.loop_slug as string) || null,
          status: "pending",
          priority: (input.priority as number) || 5,
          due_date: (input.due_date as string) || null,
          tags: (input.tags as string[]) || [],
        })
        .select("id, title")
        .single();

      if (error) {
        console.error("[TyrolkaTools] create_op error:", error);
        return `Błąd: nie udało się stworzyć opa`;
      }

      return `Op stworzony: "${data.title}" (ID: ${data.id})`;
    },
  },
  {
    definition: {
      name: "create_quest",
      description:
        "Stwórz nowy projekt (Quest) — grupuje zadania (Ops). Quest to projekt z terminem i celem.",
      input_schema: {
        type: "object" as const,
        properties: {
          title: { type: "string", description: "Tytuł questa/projektu" },
          description: { type: "string", description: "Opis projektu" },
          campaign_id: {
            type: "string",
            description: "ID kampanii nadrzędnej (opcjonalny)",
          },
          loop_slug: {
            type: "string",
            description: "Slug pętli: health, productivity, finance, etc.",
          },
          deadline: {
            type: "string",
            description: "Termin YYYY-MM-DD (opcjonalny)",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tagi projektu",
          },
        },
        required: ["title"],
      },
    },
    execute: async (input, tenantId) => {
      if (!(await isQuestSystemEnabled(tenantId))) {
        return "System Tyrolka nie jest jeszcze aktywny.";
      }

      const supabase = getServiceSupabase();
      const { data, error } = await supabase
        .from("user_quests")
        .insert({
          tenant_id: tenantId,
          title: input.title as string,
          description: (input.description as string) || null,
          campaign_id: (input.campaign_id as string) || null,
          loop_slug: (input.loop_slug as string) || null,
          status: "active",
          start_date: new Date().toISOString().split("T")[0],
          deadline: (input.deadline as string) || null,
          tags: (input.tags as string[]) || [],
        })
        .select("id, title")
        .single();

      if (error) {
        console.error("[TyrolkaTools] create_quest error:", error);
        return `Błąd: nie udało się stworzyć questa`;
      }

      return `Quest stworzony: "${data.title}" (ID: ${data.id})`;
    },
  },
  {
    definition: {
      name: "list_ops",
      description:
        "Pokaż zadania (Ops) użytkownika z systemu Tyrolka. Filtruj po queście, statusie, pętli.",
      input_schema: {
        type: "object" as const,
        properties: {
          quest_id: {
            type: "string",
            description: "Filtruj po queście (opcjonalny)",
          },
          status: {
            type: "string",
            description: "Status: pending, active, completed, dropped, blocked",
          },
          loop_slug: { type: "string", description: "Filtruj po pętli" },
          overdue: { type: "boolean", description: "Tylko przeterminowane" },
        },
      },
    },
    execute: async (input, tenantId) => {
      if (!(await isQuestSystemEnabled(tenantId))) {
        return "System Tyrolka nie jest jeszcze aktywny. Użyj list_tasks zamiast tego.";
      }

      const supabase = getServiceSupabase();
      let query = supabase
        .from("user_ops")
        .select("id, title, status, priority, due_date, quest_id, tags")
        .eq("tenant_id", tenantId)
        .order("priority", { ascending: false })
        .limit(15);

      if (input.quest_id)
        query = query.eq("quest_id", input.quest_id as string);
      if (input.status) query = query.eq("status", input.status as string);
      if (input.loop_slug)
        query = query.eq("loop_slug", input.loop_slug as string);
      if (input.overdue) query = query.lt("due_date", new Date().toISOString());

      const { data: ops, error } = await query;

      if (error || !ops || ops.length === 0) {
        return "Brak opsów pasujących do filtrów.";
      }

      const lines = ops.map((op) => {
        const tags = op.tags?.length ? ` [${op.tags.join(", ")}]` : "";
        const due = op.due_date ? ` (do: ${op.due_date})` : "";
        return `- ${op.title} (${op.status}, P${op.priority})${due}${tags}`;
      });

      return `${ops.length} opsów:\n${lines.join("\n")}`;
    },
  },
  {
    definition: {
      name: "list_quests",
      description:
        "Pokaż projekty (Quests) użytkownika z liczbą zadań w każdym.",
      input_schema: {
        type: "object" as const,
        properties: {
          status: {
            type: "string",
            description: "Status: active, completed, archived",
          },
          loop_slug: { type: "string", description: "Filtruj po pętli" },
        },
      },
    },
    execute: async (input, tenantId) => {
      if (!(await isQuestSystemEnabled(tenantId))) {
        return "System Tyrolka nie jest jeszcze aktywny.";
      }

      const supabase = getServiceSupabase();
      let query = supabase
        .from("user_quests")
        .select("id, title, status, deadline, loop_slug, tags")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (input.status) query = query.eq("status", input.status as string);
      if (input.loop_slug)
        query = query.eq("loop_slug", input.loop_slug as string);

      const { data: quests, error } = await query;

      if (error || !quests || quests.length === 0) {
        return "Brak questów.";
      }

      // Count ops per quest
      const questIds = quests.map((q) => q.id);
      const { data: opCounts } = await supabase
        .from("user_ops")
        .select("quest_id")
        .eq("tenant_id", tenantId)
        .in("quest_id", questIds);

      const countMap = new Map<string, number>();
      for (const op of opCounts || []) {
        countMap.set(op.quest_id, (countMap.get(op.quest_id) || 0) + 1);
      }

      const lines = quests.map((q) => {
        const ops = countMap.get(q.id) || 0;
        const deadline = q.deadline ? ` (do: ${q.deadline})` : "";
        const loop = q.loop_slug ? ` [${q.loop_slug}]` : "";
        return `- ${q.title}: ${ops} opsów, ${q.status}${deadline}${loop}`;
      });

      return `${quests.length} questów:\n${lines.join("\n")}`;
    },
  },
  {
    definition: {
      name: "update_op_status",
      description:
        "Zmień status opa (zadania): pending, active, completed, dropped, blocked.",
      input_schema: {
        type: "object" as const,
        properties: {
          op_id: { type: "string", description: "ID opa do aktualizacji" },
          status: {
            type: "string",
            description:
              "Nowy status: pending, active, completed, dropped, blocked",
          },
        },
        required: ["op_id", "status"],
      },
    },
    execute: async (input, tenantId) => {
      if (!(await isQuestSystemEnabled(tenantId))) {
        return "System Tyrolka nie jest jeszcze aktywny.";
      }

      const supabase = getServiceSupabase();
      const validStatuses = [
        "pending",
        "active",
        "completed",
        "dropped",
        "blocked",
      ];
      const status = input.status as string;

      if (!validStatuses.includes(status)) {
        return `Nieprawidłowy status. Dozwolone: ${validStatuses.join(", ")}`;
      }

      const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (status === "completed") {
        updates.completed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from("user_ops")
        .update(updates)
        .eq("id", input.op_id as string)
        .eq("tenant_id", tenantId)
        .select("title")
        .single();

      if (error || !data) {
        console.error("[TyrolkaTools] update_op_status error:", error);
        return `Błąd: nie znaleziono opa lub nie udało się zaktualizować`;
      }

      return `Op "${data.title}" zmieniony na: ${status}`;
    },
  },
];
