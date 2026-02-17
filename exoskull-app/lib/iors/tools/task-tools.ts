/**
 * IORS Task Tools
 *
 * Tools for managing user tasks via conversation.
 * Uses centralized task-service (dual-write/read for Tyrolka migration).
 * - add_task: Create a new task
 * - complete_task: Mark a task as done
 * - list_tasks: Show current tasks
 */

import type { ToolDefinition } from "./shared";
import {
  createTask,
  completeTask,
  getTasks,
  findTaskByTitle,
} from "@/lib/tasks/task-service";

import { logger } from "@/lib/logger";
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
      try {
        const result = await createTask(tenantId, {
          title: input.title as string,
          priority: ((input.priority as number) || 2) as 1 | 2 | 3 | 4,
          status: "pending",
        });

        if (!result.id) {
          return `Błąd: nie udało się dodać zadania`;
        }

        return `Dodano zadanie: "${input.title}"`;
      } catch (error) {
        logger.error("[TaskTools] add_task error:", error);
        return `Błąd: nie udało się dodać zadania`;
      }
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
      try {
        const task = await findTaskByTitle(
          tenantId,
          input.task_title as string,
        );

        if (!task) {
          return `Nie znaleziono zadania zawierającego: "${input.task_title}"`;
        }

        const result = await completeTask(task.id, tenantId);

        if (!result.success) {
          logger.error("[TaskTools] complete_task error:", result.error);
          return `Błąd: nie udało się ukończyć zadania`;
        }

        return `Ukończono zadanie: "${task.title}"`;
      } catch (error) {
        logger.error("[TaskTools] complete_task error:", error);
        return `Błąd: nie udało się ukończyć zadania`;
      }
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
      try {
        const status = (input.status as string) || "pending";
        const filters =
          status !== "all" ? { status, limit: 10 } : { limit: 10 };
        const tasks = await getTasks(tenantId, filters);

        if (!tasks || tasks.length === 0) {
          return status === "pending" ? "Brak aktywnych zadań" : "Brak zadań";
        }

        const taskList = tasks.map((t) => t.title).join(", ");
        return `Masz ${tasks.length} zadań: ${taskList}`;
      } catch (error) {
        logger.error("[TaskTools] list_tasks error:", error);
        return "Błąd: nie udało się pobrać listy zadań";
      }
    },
  },
];
