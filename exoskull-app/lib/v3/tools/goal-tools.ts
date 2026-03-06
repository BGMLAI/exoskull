/**
 * v3 Goal Tools — Phase 3
 *
 * 6 tools: set_goal, update_goal, get_goals, create_task, update_task, get_tasks
 *
 * Maps to Tyrolka framework: user_loops (goals), user_campaigns (strategies),
 * user_quests (milestones), user_ops (tasks), user_notes (notes)
 */

import type { V3ToolDefinition } from "./index";
import { logger } from "@/lib/logger";

// ============================================================================
// F1: GRAPH DUAL-WRITE HELPER
// Writes to nodes/edges table alongside Tyrolka tables.
// Silent fail — old tables are source of truth during migration.
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function graphDualWrite(
  supabase: any,
  params: {
    tenantId: string;
    type: "goal" | "task" | "note";
    name: string;
    content?: string | null;
    metadata?: Record<string, unknown>;
    status?: string;
    parentId?: string | null;
    legacyId: string; // user_loops.id or user_ops.id
  },
) {
  try {
    const { data } = await supabase
      .from("nodes")
      .upsert(
        {
          tenant_id: params.tenantId,
          type: params.type,
          name: params.name,
          content: params.content || null,
          metadata: { ...params.metadata, legacy_id: params.legacyId },
          status: params.status || "active",
          parent_id: params.parentId || null,
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();

    // If task has a goal parent, create edge
    if (data?.id && params.parentId) {
      await supabase.from("edges").upsert(
        {
          source_id: params.parentId,
          target_id: data.id,
          relation: "has_subtask",
        },
        { onConflict: "source_id,target_id,relation" },
      );
    }

    return data?.id || null;
  } catch (err) {
    // Silent fail — graph is secondary during migration
    logger.warn("[GraphDualWrite] Failed (non-blocking):", {
      error: err instanceof Error ? err.message : String(err),
      type: params.type,
      name: params.name,
    });
    return null;
  }
}

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

      // Generate slug from title (URL-safe, lowercase, no diacritics)
      const slug = (input.title as string)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60);

      const { data, error } = await supabase
        .from("user_loops")
        .insert({
          tenant_id: tenantId,
          slug,
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

      // F1: Graph dual-write
      await graphDualWrite(supabase, {
        tenantId,
        type: "goal",
        name: data.name,
        content: (input.description as string) || null,
        metadata: {
          priority: (input.priority as number) || 7,
          deadline: input.deadline || null,
          category: input.category || "personal",
        },
        legacyId: data.id,
      });

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
      "Zaktualizuj postęp lub status celu. Użyj po każdej akcji przybliżającej cel. Podaj goal_id (UUID) LUB goal_name (nazwę) — system sam znajdzie cel.",
    input_schema: {
      type: "object" as const,
      properties: {
        goal_id: { type: "string", description: "UUID celu" },
        goal_name: {
          type: "string",
          description: "Nazwa celu (jeśli nie znasz UUID)",
        },
        progress: { type: "number", description: "Postęp 0-100%" },
        status: {
          type: "string",
          enum: ["active", "completed", "paused", "dropped"],
          description: "Nowy status",
        },
        note: { type: "string", description: "Notatka o postępie" },
      },
      required: [],
    },
  },
  async execute(input, tenantId) {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      // Resolve goal: try UUID first, then name search
      let goal: { id: string; name: string; aspects: unknown } | null = null;

      if (input.goal_id) {
        const { data } = await supabase
          .from("user_loops")
          .select("id, name, aspects")
          .eq("id", input.goal_id as string)
          .eq("tenant_id", tenantId)
          .single();
        goal = data;
      }

      if (!goal && input.goal_name) {
        // Fuzzy match by name (case-insensitive, partial match)
        const { data } = await supabase
          .from("user_loops")
          .select("id, name, aspects")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .ilike("name", `%${input.goal_name as string}%`)
          .limit(1)
          .single();
        goal = data;
      }

      if (!goal && !input.goal_id && !input.goal_name) {
        return "Podaj goal_id (UUID) lub goal_name (nazwę celu) żebym mógł go znaleźć.";
      }

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
        .eq("id", goal.id)
        .eq("tenant_id", tenantId);

      if (error) return `Błąd: ${error.message}`;

      // Sync to graph node (non-blocking)
      const graphUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (input.status) graphUpdates.status = input.status as string;
      if (input.progress !== undefined) {
        graphUpdates.metadata = {
          ...aspects,
          progress: input.progress,
          legacy_id: goal.id,
        };
      }
      Promise.resolve(
        supabase
          .from("nodes")
          .update(graphUpdates)
          .eq("tenant_id", tenantId)
          .eq("type", "goal")
          .contains("metadata", { legacy_id: goal.id }),
      ).catch(() => {});

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

      // Graph DB: goals are nodes with type='goal'
      let query = supabase
        .from("nodes")
        .select("id, name, content, status, metadata, created_at")
        .eq("tenant_id", tenantId)
        .eq("type", "goal")
        .order("created_at", { ascending: false });

      if (!input.include_completed) {
        query = query.in("status", ["active", "pending", "paused"]);
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
            content: string | null;
            status: string;
            metadata: Record<string, unknown> | null;
          }) => {
            const meta = g.metadata || {};
            const progress = (meta.progress as number) || 0;
            const priority = (meta.priority as number) || 5;
            const bar =
              "█".repeat(Math.floor(progress / 10)) +
              "░".repeat(10 - Math.floor(progress / 10));
            return `[${g.status === "completed" ? "✅" : "🎯"}] ${g.name} (priorytet: ${priority}/10)\n    ${bar} ${progress}%${g.content ? `\n    ${g.content.slice(0, 100)}` : ""}`;
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

      // F1: Graph dual-write — find parent graph node if goal_id provided
      let graphGoalNodeId: string | null = null;
      if (input.goal_id) {
        const { data: parentNode } = await supabase
          .from("nodes")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("type", "goal")
          .contains("metadata", { legacy_id: input.goal_id })
          .limit(1)
          .single();
        graphGoalNodeId = parentNode?.id || null;
      }
      await graphDualWrite(supabase, {
        tenantId,
        type: "task",
        name: data.title,
        content: (input.details as string) || null,
        metadata: {
          priority: (input.priority as number) || 5,
          due_date: input.due_date || null,
          assignee: input.assignee || "user",
          goal_id: input.goal_id || null,
        },
        parentId: graphGoalNodeId,
        legacyId: data.id,
      });

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
        task_id: {
          type: "string",
          description:
            "UUID zadania LUB nazwa/fragment nazwy (system sam znajdzie po nazwie)",
        },
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

      // ── Resolve task_id: accept UUID or fuzzy name match ──
      let taskId = input.task_id as string;
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          taskId,
        );

      if (!isUUID) {
        // AI passed a name/title instead of UUID — resolve it
        const { data: found } = await supabase
          .from("user_ops")
          .select("id, title")
          .eq("tenant_id", tenantId)
          .eq("type", "task")
          .ilike("title", `%${taskId}%`)
          .limit(1)
          .single();

        if (found) {
          taskId = found.id;
        } else {
          // Try graph nodes table
          const { data: node } = await supabase
            .from("nodes")
            .select("id, name, metadata")
            .eq("tenant_id", tenantId)
            .eq("type", "task")
            .ilike("name", `%${taskId}%`)
            .limit(1)
            .single();

          if (
            node?.metadata &&
            typeof node.metadata === "object" &&
            "legacy_id" in node.metadata
          ) {
            taskId = (node.metadata as Record<string, string>).legacy_id;
          } else {
            return `Nie znaleziono zadania "${input.task_id}". Użyj get_tasks żeby zobaczyć listę z UUID.`;
          }
        }
      }

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
        .eq("id", taskId)
        .eq("tenant_id", tenantId)
        .select("title, status")
        .single();

      if (error) return `Błąd: ${error.message}`;

      // Sync status to graph node (non-blocking)
      Promise.resolve(
        supabase
          .from("nodes")
          .update({
            status: input.status as string,
            updated_at: new Date().toISOString(),
          })
          .eq("tenant_id", tenantId)
          .eq("type", "task")
          .contains("metadata", { legacy_id: taskId }),
      ).catch(() => {});

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

      // Graph DB: tasks are nodes with type='task'
      let query = supabase
        .from("nodes")
        .select("id, name, status, metadata, created_at")
        .eq("tenant_id", tenantId)
        .eq("type", "task")
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
          (t: { metadata: Record<string, unknown> | null }) =>
            t.metadata?.goal_id === input.goal_id,
        );
        if (!filtered.length) return "Brak zadań powiązanych z tym celem.";
      }

      return filtered
        .map(
          (t: {
            id: string;
            name: string;
            status: string;
            metadata: Record<string, unknown> | null;
          }) => {
            const meta = t.metadata || {};
            const priority = (meta.priority as number) || 5;
            const assignee = meta.assignee === "system" ? "🤖" : "👤";
            const statusIcon =
              t.status === "completed"
                ? "✅"
                : t.status === "active"
                  ? "🔄"
                  : "⏳";
            return `${statusIcon} ${assignee} ${t.name} (p:${priority})${meta.due_date ? ` — do ${meta.due_date}` : ""}`;
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
