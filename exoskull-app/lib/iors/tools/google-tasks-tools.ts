/**
 * Google Tasks IORS Tools
 *
 * 4 tools: list, create, complete, delete
 */

import type { ToolDefinition } from "./shared";
import {
  listGoogleTasks,
  createGoogleTask,
  completeGoogleTask,
  deleteGoogleTask,
} from "@/lib/integrations/google-tasks-adapter";

export const googleTasksTools: ToolDefinition[] = [
  {
    definition: {
      name: "list_google_tasks",
      description: "Pokaż zadania z Google Tasks użytkownika.",
      input_schema: {
        type: "object" as const,
        properties: {
          show_completed: {
            type: "boolean",
            description: "Pokaż ukończone zadania (domyślnie false)",
          },
          list_id: {
            type: "string",
            description: "ID listy zadań (opcjonalnie — domyślnie wszystkie)",
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      const result = await listGoogleTasks(
        tenantId,
        (input.show_completed as boolean) || false,
        input.list_id as string | undefined,
      );
      if (!result.ok) return result.error || "Błąd pobierania zadań.";
      return result.formatted!;
    },
  },
  {
    definition: {
      name: "create_google_task",
      description: "Utwórz nowe zadanie w Google Tasks.",
      input_schema: {
        type: "object" as const,
        properties: {
          title: { type: "string", description: "Tytuł zadania" },
          notes: { type: "string", description: "Notatki/opis" },
          due_date: { type: "string", description: "Termin (YYYY-MM-DD)" },
          list_id: { type: "string", description: "ID listy (opcjonalnie)" },
        },
        required: ["title"],
      },
    },
    execute: async (input, tenantId) => {
      const result = await createGoogleTask(
        tenantId,
        input.title as string,
        input.notes as string | undefined,
        input.due_date as string | undefined,
        input.list_id as string | undefined,
      );
      if (!result.ok) return result.error || "Nie udało się utworzyć zadania.";
      return result.formatted!;
    },
  },
  {
    definition: {
      name: "complete_google_task",
      description: "Oznacz zadanie Google Tasks jako ukończone.",
      input_schema: {
        type: "object" as const,
        properties: {
          task_id: { type: "string", description: "ID zadania" },
          list_id: { type: "string", description: "ID listy zadań" },
        },
        required: ["task_id", "list_id"],
      },
    },
    execute: async (input, tenantId) => {
      const result = await completeGoogleTask(
        tenantId,
        input.task_id as string,
        input.list_id as string,
      );
      if (!result.ok) return result.error || "Nie udało się ukończyć zadania.";
      return result.formatted!;
    },
  },
  {
    definition: {
      name: "delete_google_task",
      description: "Usuń zadanie z Google Tasks.",
      input_schema: {
        type: "object" as const,
        properties: {
          task_id: { type: "string", description: "ID zadania" },
          list_id: { type: "string", description: "ID listy zadań" },
        },
        required: ["task_id", "list_id"],
      },
    },
    execute: async (input, tenantId) => {
      const result = await deleteGoogleTask(
        tenantId,
        input.task_id as string,
        input.list_id as string,
      );
      if (!result.ok) return result.error || "Nie udało się usunąć zadania.";
      return "Zadanie usunięte.";
    },
  },
];
