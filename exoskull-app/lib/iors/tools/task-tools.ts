/**
 * IORS Task Tools
 *
 * Tools for managing user tasks via conversation.
 * - add_task: Create a new task
 * - complete_task: Mark a task as done
 * - list_tasks: Show current tasks
 */

import type { ToolDefinition } from "./index";
import { getServiceSupabase } from "@/lib/supabase/service";

export const taskTools: ToolDefinition[] = [
  {
    definition: {
      name: "add_task",
      description: "Dodaj nowe zadanie do listy użytkownika",
      input_schema: {
        type: "object" as const,
        properties: {
          title: { type: "string", description: "Tytuł zadania" },
          priority: {
            type: "number",
            description: "Priorytet 1-4 (1=krytyczny, 4=niski)",
            default: 2,
          },
        },
        required: ["title"],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const { error } = await supabase
        .from("exo_tasks")
        .insert({
          tenant_id: tenantId,
          title: input.title as string,
          priority: (input.priority as number) || 2,
          status: "pending",
        })
        .select()
        .single();

      if (error) {
        console.error("[TaskTools] add_task error:", error);
        return `Błąd: nie udało się dodać zadania`;
      }

      return `Dodano zadanie: "${input.title}"`;
    },
  },
  {
    definition: {
      name: "complete_task",
      description: "Oznacz zadanie jako ukończone",
      input_schema: {
        type: "object" as const,
        properties: {
          task_title: {
            type: "string",
            description: "Tytuł lub fragment tytułu zadania do ukończenia",
          },
        },
        required: ["task_title"],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const { data: tasks } = await supabase
        .from("exo_tasks")
        .select("id, title")
        .eq("tenant_id", tenantId)
        .eq("status", "pending")
        .ilike("title", `%${input.task_title}%`)
        .limit(1);

      if (!tasks || tasks.length === 0) {
        return `Nie znaleziono zadania zawierającego: "${input.task_title}"`;
      }

      const task = tasks[0];
      const { error } = await supabase
        .from("exo_tasks")
        .update({
          status: "done",
          completed_at: new Date().toISOString(),
        })
        .eq("id", task.id);

      if (error) {
        console.error("[TaskTools] complete_task error:", error);
        return `Błąd: nie udało się ukończyć zadania`;
      }

      return `Ukończono zadanie: "${task.title}"`;
    },
  },
  {
    definition: {
      name: "list_tasks",
      description: "Wyświetl aktualne zadania użytkownika",
      input_schema: {
        type: "object" as const,
        properties: {
          status: {
            type: "string",
            description: "Status: pending, done, all",
            default: "pending",
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const status = (input.status as string) || "pending";
      let query = supabase
        .from("exo_tasks")
        .select("title, status, priority")
        .eq("tenant_id", tenantId)
        .limit(10);

      if (status !== "all") {
        query = query.eq("status", status);
      }

      const { data: tasks, error } = await query;

      if (error || !tasks || tasks.length === 0) {
        return status === "pending" ? "Brak aktywnych zadań" : "Brak zadań";
      }

      const taskList = tasks.map((t) => t.title).join(", ");
      return `Masz ${tasks.length} zadań: ${taskList}`;
    },
  },
];
