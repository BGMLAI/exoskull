/**
 * IORS Memory Tools
 *
 * Tools for managing daily summaries and memory search via conversation.
 * - get_daily_summary: Retrieve daily summary
 * - correct_daily_summary: Apply correction to daily summary
 * - search_memory: Search conversation history
 */

import type { ToolDefinition } from "./index";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  getSummaryForDisplay,
  applyCorrection,
  createDailySummary,
} from "@/lib/memory/daily-summary";
import {
  keywordSearch,
  formatSearchResultsForResponse,
} from "@/lib/memory/search";

export const memoryTools: ToolDefinition[] = [
  {
    definition: {
      name: "get_daily_summary",
      description:
        'Pobierz podsumowanie dnia. Użyj gdy user pyta "jak minął dzień", "co robiłem dziś", "pokaż podsumowanie".',
      input_schema: {
        type: "object" as const,
        properties: {
          date: {
            type: "string",
            description: "Data podsumowania (YYYY-MM-DD). Domyślnie dzisiaj.",
          },
        },
        required: [],
      },
    },
    execute: async (input, tenantId) => {
      const date = input.date as string | undefined;
      console.log("[MemoryTools] get_daily_summary:", { date, tenantId });

      try {
        let summaryText = await getSummaryForDisplay(tenantId, date);

        if (!summaryText) {
          const summary = await createDailySummary(tenantId);
          if (summary) {
            summaryText = await getSummaryForDisplay(tenantId, date);
          }
        }

        if (!summaryText) {
          return "Nie mam jeszcze podsumowania na dziś. Porozmawiajmy najpierw, a potem przygotuję dla Ciebie podsumowanie.";
        }

        return summaryText;
      } catch (summaryError) {
        console.error("[MemoryTools] get_daily_summary error:", summaryError);
        return "Nie udało się pobrać podsumowania dnia.";
      }
    },
  },
  {
    definition: {
      name: "correct_daily_summary",
      description:
        'Dodaj korektę do podsumowania dnia. Użyj gdy user mówi "to był Marek nie Tomek", "zapomniałeś że byłem na siłowni", "to nieprawda że...".',
      input_schema: {
        type: "object" as const,
        properties: {
          correction_type: {
            type: "string",
            enum: ["correction", "addition", "removal"],
            description:
              "Typ korekty: correction (zmiana), addition (dodanie), removal (usunięcie)",
          },
          original: {
            type: "string",
            description: "Oryginalna treść do zmiany (dla correction/removal)",
          },
          corrected: {
            type: "string",
            description: "Nowa treść (dla correction/addition)",
          },
        },
        required: ["correction_type", "corrected"],
      },
    },
    execute: async (input, tenantId) => {
      const correctionType = input.correction_type as
        | "correction"
        | "addition"
        | "removal";
      const original = (input.original as string) || "";
      const corrected = input.corrected as string;

      console.log("[MemoryTools] correct_daily_summary:", {
        correctionType,
        original: original.slice(0, 50),
        corrected: corrected.slice(0, 50),
        tenantId,
      });

      try {
        const supabase = getServiceSupabase();
        const today = new Date().toISOString().split("T")[0];
        const { data: summary } = await supabase
          .from("exo_daily_summaries")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("summary_date", today)
          .single();

        if (!summary) {
          const newSummary = await createDailySummary(tenantId);
          if (!newSummary) {
            return "Nie mam jeszcze podsumowania do poprawienia. Poczekaj na wieczorne podsumowanie.";
          }

          await applyCorrection(newSummary.id, {
            type: correctionType,
            original,
            corrected,
          });
        } else {
          await applyCorrection(summary.id, {
            type: correctionType,
            original,
            corrected,
          });
        }

        if (correctionType === "correction") {
          return `Zapisałem korektę: "${original}" → "${corrected}". Dziękuję za poprawkę!`;
        } else if (correctionType === "addition") {
          return `Dodałem do podsumowania: "${corrected}". Dziękuję za uzupełnienie!`;
        } else {
          return `Usunąłem z podsumowania: "${original}". Notuję!`;
        }
      } catch (corrError) {
        console.error("[MemoryTools] correct_daily_summary error:", corrError);
        return "Nie udało się zapisać korekty. Spróbuj jeszcze raz.";
      }
    },
  },
  {
    definition: {
      name: "search_memory",
      description:
        'Przeszukaj pamięć/historię rozmów. Użyj gdy user pyta "kiedy mówiłem o...", "co ostatnio o...", "znajdź...", "szukaj...".',
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Fraza do wyszukania w pamięci",
          },
          date_from: {
            type: "string",
            description: "Data początkowa (YYYY-MM-DD), opcjonalne",
          },
          date_to: {
            type: "string",
            description: "Data końcowa (YYYY-MM-DD), opcjonalne",
          },
        },
        required: ["query"],
      },
    },
    execute: async (input, tenantId) => {
      const query = input.query as string;
      const dateFrom = input.date_from as string | undefined;
      const dateTo = input.date_to as string | undefined;

      console.log("[MemoryTools] search_memory:", {
        query,
        dateFrom,
        dateTo,
        tenantId,
      });

      try {
        const results = await keywordSearch({
          tenantId,
          query,
          limit: 10,
          dateFrom,
          dateTo,
        });

        return formatSearchResultsForResponse(results, query);
      } catch (searchError) {
        console.error("[MemoryTools] search_memory error:", searchError);
        return `Nie udało się przeszukać pamięci. Spróbuj jeszcze raz.`;
      }
    },
  },
];
