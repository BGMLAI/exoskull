/**
 * Reflexion IORS Tools — Sweet & Sour Learning Pattern
 *
 * reflexion_evaluate: Log what worked (sweet) and what didn't (sour) after task completion.
 * get_learned_patterns: Retrieve past patterns for context injection before similar tasks.
 *
 * Data stored in exo_dev_journal (entry_type: "learning") — reuses Ralph infra.
 */

import type { ToolDefinition } from "./shared";
import { getServiceSupabase } from "@/lib/supabase/service";

export const reflexionTools: ToolDefinition[] = [
  {
    definition: {
      name: "reflexion_evaluate",
      description:
        "Oceń wynik zadania: co zadziałało (sweet) i co nie (sour). " +
        "System zapamiętuje wzorce i używa ich w przyszłości. " +
        "Użyj po: zakończeniu zadania, naprawieniu błędu, zbudowaniu czegoś.",
      input_schema: {
        type: "object" as const,
        properties: {
          task_description: {
            type: "string",
            description: "Krótki opis zadania które właśnie wykonano",
          },
          sweet: {
            type: "array",
            items: { type: "string" },
            description:
              "Co zadziałało dobrze (np. 'użycie cache skróciło czas o 80%')",
          },
          sour: {
            type: "array",
            items: { type: "string" },
            description:
              "Co nie zadziałało / co poprawić (np. 'timeout po 30s na dużych plikach')",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description:
              "Tagi do kategoryzacji (np. 'performance', 'api', 'email')",
          },
        },
        required: ["task_description", "sweet", "sour"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const supabase = getServiceSupabase();

      const sweet = (input.sweet as string[]) || [];
      const sour = (input.sour as string[]) || [];
      const tags = (input.tags as string[]) || [];

      const { error } = await supabase.from("exo_dev_journal").insert({
        tenant_id: tenantId,
        entry_type: "learning",
        title: `Reflexion: ${(input.task_description as string).slice(0, 100)}`,
        details: {
          task: input.task_description,
          sweet,
          sour,
          tags,
          evaluated_at: new Date().toISOString(),
        },
        outcome: sour.length === 0 ? "success" : "mixed",
      });

      if (error) {
        return `Error: nie mogę zapisać refleksji: ${error.message}`;
      }

      return (
        `Refleksja zapisana.\n` +
        `Sweet (${sweet.length}): ${sweet.join("; ")}\n` +
        `Sour (${sour.length}): ${sour.join("; ")}\n` +
        `System użyje tych wzorców w przyszłych zadaniach.`
      );
    },
  },
  {
    definition: {
      name: "get_learned_patterns",
      description:
        "Pobierz wzorce z wcześniejszych refleksji — co działało, co nie. " +
        "Użyj PRZED rozpoczęciem zadania, żeby uniknąć powtarzania błędów. " +
        "Filtruj po tagach lub szukaj po słowach kluczowych.",
      input_schema: {
        type: "object" as const,
        properties: {
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Filtruj wzorce po tagach (np. ['api', 'email'])",
          },
          keyword: {
            type: "string",
            description: "Szukaj w opisach zadań (np. 'deploy')",
          },
          limit: {
            type: "integer",
            description: "Ile wzorców zwrócić (domyślnie 5, max 15)",
          },
        },
        required: [],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const supabase = getServiceSupabase();
      const limit = Math.min(Number(input.limit) || 5, 15);

      let query = supabase
        .from("exo_dev_journal")
        .select("title, details, outcome, created_at")
        .eq("tenant_id", tenantId)
        .eq("entry_type", "learning")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (input.keyword) {
        query = query.ilike("title", `%${input.keyword}%`);
      }

      const { data, error } = await query;

      if (error) {
        return `Error: nie mogę pobrać wzorców: ${error.message}`;
      }

      if (!data || data.length === 0) {
        return "Brak zapisanych wzorców. Użyj reflexion_evaluate po zakończeniu zadań.";
      }

      const patterns = data
        .filter((entry: Record<string, unknown>) => {
          if (!input.tags || !(input.tags as string[]).length) return true;
          const details = entry.details as Record<string, unknown>;
          const entryTags = (details?.tags as string[]) || [];
          return (input.tags as string[]).some((t: string) =>
            entryTags.includes(t),
          );
        })
        .map((entry: Record<string, unknown>) => {
          const details = entry.details as Record<string, unknown>;
          const sweet = ((details?.sweet as string[]) || []).join("; ");
          const sour = ((details?.sour as string[]) || []).join("; ");
          return `- ${entry.title} [${entry.outcome}]\n  Sweet: ${sweet || "brak"}\n  Sour: ${sour || "brak"}`;
        });

      return `Wzorce z refleksji (${patterns.length}):\n${patterns.join("\n")}`;
    },
  },
];
