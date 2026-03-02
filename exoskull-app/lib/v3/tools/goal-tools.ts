/**
 * v3 Goal Tools — Phase 3
 *
 * 6 tools: set_goal, update_goal, get_goals, create_task, update_task, get_tasks
 *
 * Maps to Tyrolka framework: user_loops (goals), user_campaigns (strategies),
 * user_quests (milestones), user_ops (tasks), user_notes (notes)
 */

import type { V3ToolDefinition } from "./index";

// ============================================================================
// #1 set_goal — create a new goal for the user
// ============================================================================

const setGoalTool: V3ToolDefinition = {
  definition: {
    name: "set_goal",
    description:
      "Ustaw nowy cel dla użytkownika. Cel to główna aspiracja (np. 'zarabiać 10k/mies', 'nauczyć się Rusta'). System automatycznie rozłoży cel na strategię i zadania.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Krótki tytuł celu" },
        description: {
          type: "string",
          description: "Szczegółowy opis celu, co dokładnie user chce osiągnąć",
        },
        priority: {
          type: "number",
          description: "Priorytet 1-10 (10 = najwyższy)",
        },
        deadline: {
          type: "string",
          description: "Termin (YYYY-MM-DD) jeśli podany",
        },
        category: {
          type: "string",
          description:
            "Kategoria: career, health, finance, learning, personal, creative, social",
        },
      },
      required: ["title"],
    },
  },
  async execute(input, tenantId) {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      const { data, error } = await supabase
        .from("user_loops")
        .insert({
          tenant_id: tenantId,
          name: input.title as string,
          description: (input.description as string) || null,
          priority: (input.priority as number) || 7,
          is_active: true,
          aspects: {
            type: "goal",
            deadline: input.deadline || null,
            category: input.category || "personal",
            strategies: [],
            progress: 0,
          },
        })
        .select("id, name")
        .single();

      if (error) return `Błąd: ${error.message}`;
      return `✅ Cel ustawiony: "${data.name}" (ID: ${data.id}). Teraz rozłożę go na strategię i konkretne zadania.`;
    } catch (err) {
      return `Błąd: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// #2 update_goal — update goal progress or status
// ============================================================================

const updateGoalTool: V3ToolDefinition = {
  definition: {
    name: "update_goal",
    description:
      "Zaktualizuj postęp lub status celu. Użyj po każdej akcji przybliżającej cel.",
    input_schema: {
      type: "object" as const,
      properties: {
        goal_id: { type: "string", description: "UUID celu" },
        progress: { type: "number", description: "Postęp 0-100%" },
        status: {
          type: "string",
          enum: ["active", "completed", "paused", "dropped"],
          description: "Nowy status",
        },
        note: { type: "string", description: "Notatka o postępie" },
      },
      required: ["goal_id"],
    },
  },
  async execute(input, tenantId) {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      // Get current goal
      const { data: goal } = await supabase
        .from("user_loops")
        .select("id, name, aspects")
        .eq("id", input.goal_id as string)
        .eq("tenant_id", tenantId)
        .single();

      if (!goal) return "Nie znaleziono celu.";

      const aspects = (goal.aspects as Record<string, unknown>) || {};
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (input.progress !== undefined) {
        aspects.progress = input.progress as number;
        updates.aspects = aspects;
      }
      if (input.status) {
        if (
          input.status === "completed" ||
          input.status === "dropped" ||
          input.status === "paused"
        ) {
          updates.is_active = false;
        } else {
          updates.is_active = true;
        }
      }
      if (input.progress !== undefined) {
        updates.aspects = aspects;
      }

      const { error } = await supabase
        .from("user_loops")
        .update(updates)
        .eq("id", input.goal_id as string)
        .eq("tenant_id", tenantId);

      if (error) return `Błąd: ${error.message}`;

      // Log progress note
      if (input.note) {
        await supabase.from("user_notes").insert({
          tenant_id: tenantId,
          title: `Postęp: ${goal.name}`,
          content: input.note as string,
          metadata: { goal_id: goal.id },
        });
      }

      return `📊 Cel "${goal.name}" zaktualizowany.${input.progress !== undefined ? ` Postęp: ${input.progress}%` : ""}${input.status ? ` Status: ${input.status}` : ""}`;
    } catch (err) {
      return `Błąd: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// #3 get_goals — list active goals
// ============================================================================

const getGoalsTool: V3ToolDefinition = {
  definition: {
    name: "get_goals",
    description:
      "Pokaż aktywne cele użytkownika. Użyj na początku rozmowy żeby wiedzieć nad czym pracujemy.",
    input_schema: {
      type: "object" as const,
      properties: {
        include_completed: {
          type: "boolean",
          description: "Pokaż też ukończone cele",
        },
      },
      required: [],
    },
  },
  async execute(input, tenantId) {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      let query = supabase
        .from("user_loops")
        .select(
          "id, name, description, priority, is_active, aspects, created_at",
        )
        .eq("tenant_id", tenantId)
        .order("priority", { ascending: false });

      if (!input.include_completed) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query.limit(20);
      if (error) return `Błąd: ${error.message}`;
      if (!data?.length)
        return "Brak aktywnych celów. Zapytaj użytkownika o jego cele!";

      return data
        .map(
          (g: {
            id: string;
            name: string;
            description: string | null;
            priority: number;
            is_active: boolean;
            aspects: unknown;
          }) => {
            const asp = (g.aspects as Record<string, unknown>) || {};
            const progress = (asp.progress as number) || 0;
            const bar =
              "█".repeat(Math.floor(progress / 10)) +
              "░".repeat(10 - Math.floor(progress / 10));
            return `[${!g.is_active ? "✅" : "🎯"}] ${g.name} (priorytet: ${g.priority}/10)\n    ${bar} ${progress}%${g.description ? `\n    ${g.description.slice(0, 100)}` : ""}`;
          },
        )
        .join("\n\n");
    } catch (err) {
      return `Błąd: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// #4 create_task — create an actionable task toward a goal
// ============================================================================

const createTaskTool: V3ToolDefinition = {
  definition: {
    name: "create_task",
    description:
      "Stwórz konkretne zadanie do wykonania. Zadania powinny być powiązane z celem — każde zadanie przybliża cel.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Co trzeba zrobić" },
        goal_id: { type: "string", description: "UUID celu nadrzędnego" },
        priority: { type: "number", description: "Priorytet 1-10" },
        due_date: { type: "string", description: "Termin (YYYY-MM-DD)" },
        assignee: {
          type: "string",
          enum: ["user", "system"],
          description:
            "Kto ma wykonać: user (człowiek) lub system (ExoSkull autonomicznie)",
        },
        details: {
          type: "string",
          description: "Szczegóły / instrukcje wykonania",
        },
      },
      required: ["title"],
    },
  },
  async execute(input, tenantId) {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      const { data, error } = await supabase
        .from("user_ops")
        .insert({
          tenant_id: tenantId,
          title: input.title as string,
          status: "pending",
          priority: (input.priority as number) || 5,
          due_date: (input.due_date as string) || null,
          metadata: {
            type: "task",
            goal_id: input.goal_id || null,
            assignee: input.assignee || "user",
            details: input.details || null,
          },
        })
        .select("id, title")
        .single();

      if (error) return `Błąd: ${error.message}`;

      // If assigned to system, enqueue for autonomous execution
      if (input.assignee === "system" && input.goal_id) {
        await supabase.from("exo_autonomy_queue").insert({
          tenant_id: tenantId,
          type: "user_request",
          payload: {
            task_id: data.id,
            task_title: data.title,
            goal_id: input.goal_id,
            details: input.details || null,
          },
          priority: (input.priority as number) || 5,
          source: "agent",
        });
      }

      const emoji = input.assignee === "system" ? "🤖" : "📋";
      return `${emoji} Zadanie: "${data.title}"${input.assignee === "system" ? " → dodano do kolejki autonomii (ExoSkull wykona sam)" : " → czeka na użytkownika"}`;
    } catch (err) {
      return `Błąd: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// #5 update_task — mark task as done, in progress, etc.
// ============================================================================

const updateTaskTool: V3ToolDefinition = {
  definition: {
    name: "update_task",
    description:
      "Zaktualizuj status zadania. Użyj gdy user lub system skończył zadanie.",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "UUID zadania" },
        status: {
          type: "string",
          enum: ["pending", "active", "completed", "dropped", "blocked"],
          description: "Nowy status",
        },
        result: { type: "string", description: "Wynik / co zostało zrobione" },
      },
      required: ["task_id", "status"],
    },
  },
  async execute(input, tenantId) {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      const updates: Record<string, unknown> = {
        status: input.status as string,
        updated_at: new Date().toISOString(),
      };
      if (input.status === "completed") {
        updates.completed_at = new Date().toISOString();
      }
      if (input.result) {
        updates.metadata = { result: input.result };
      }

      const { data, error } = await supabase
        .from("user_ops")
        .update(updates)
        .eq("id", input.task_id as string)
        .eq("tenant_id", tenantId)
        .select("title, status")
        .single();

      if (error) return `Błąd: ${error.message}`;
      return `${input.status === "completed" ? "✅" : "📋"} "${data.title}" → ${data.status}`;
    } catch (err) {
      return `Błąd: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// #6 get_tasks — list tasks (optionally filtered by goal)
// ============================================================================

const getTasksTool: V3ToolDefinition = {
  definition: {
    name: "get_tasks",
    description: "Pokaż zadania użytkownika. Filtruj po celu lub statusie.",
    input_schema: {
      type: "object" as const,
      properties: {
        goal_id: { type: "string", description: "Filtruj zadania po celu" },
        status: {
          type: "string",
          enum: ["pending", "active", "completed", "all"],
          description:
            "Filtruj po statusie. Default: aktywne (pending + active)",
        },
        limit: { type: "number", description: "Ile wyników (default: 15)" },
      },
      required: [],
    },
  },
  async execute(input, tenantId) {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      let query = supabase
        .from("user_ops")
        .select("id, title, status, priority, metadata, created_at")
        .eq("tenant_id", tenantId)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false })
        .limit((input.limit as number) || 15);

      if (input.status && input.status !== "all") {
        query = query.eq("status", input.status as string);
      } else if (!input.status) {
        query = query.in("status", ["pending", "active"]);
      }

      const { data, error } = await query;
      if (error) return `Błąd: ${error.message}`;
      if (!data?.length) return "Brak zadań.";

      // Filter by goal_id if specified (stored in metadata)
      let filtered = data;
      if (input.goal_id) {
        filtered = data.filter(
          (t: { metadata: unknown }) =>
            (t.metadata as Record<string, unknown>)?.goal_id === input.goal_id,
        );
        if (!filtered.length) return "Brak zadań powiązanych z tym celem.";
      }

      return filtered
        .map(
          (t: {
            id: string;
            title: string;
            status: string;
            priority: number;
            metadata: unknown;
          }) => {
            const meta = (t.metadata as Record<string, unknown>) || {};
            const assignee = meta.assignee === "system" ? "🤖" : "👤";
            const statusIcon =
              t.status === "completed"
                ? "✅"
                : t.status === "active"
                  ? "🔄"
                  : "⏳";
            return `${statusIcon} ${assignee} ${t.title} (p:${t.priority})${meta.due_date ? ` — do ${meta.due_date}` : ""}`;
          },
        )
        .join("\n");
    } catch (err) {
      return `Błąd: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// EXPORT
// ============================================================================

export const goalTools: V3ToolDefinition[] = [
  setGoalTool,
  updateGoalTool,
  getGoalsTool,
  createTaskTool,
  updateTaskTool,
  getTasksTool,
];
