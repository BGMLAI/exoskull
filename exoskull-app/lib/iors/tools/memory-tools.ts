/**
 * IORS Memory Tools
 *
 * Tools for managing daily summaries and memory search via conversation.
 * - get_daily_summary: Retrieve daily summary
 * - correct_daily_summary: Apply correction to daily summary
 * - search_memory: Search conversation history
 */

import type { ToolDefinition } from "./shared";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import {
  getSummaryForDisplay,
  applyCorrection,
  createDailySummary,
} from "@/lib/memory/daily-summary";
import {
  keywordSearch,
  formatSearchResultsForResponse,
} from "@/lib/memory/search";
import {
  unifiedSearch,
  formatUnifiedResultsForResponse,
} from "@/lib/memory/unified-search";
import { searchBrain, formatBrainResults, remember } from "@/lib/memory/brain";

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
      logger.info("[MemoryTools] get_daily_summary:", { date, tenantId });

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
        logger.error("[MemoryTools] get_daily_summary error:", summaryError);
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

      logger.info("[MemoryTools] correct_daily_summary:", {
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
          let newSummary;
          try {
            newSummary = await createDailySummary(tenantId);
          } catch (createErr) {
            logger.error("[MemoryTools] createDailySummary failed:", {
              tenantId,
              error: createErr instanceof Error ? createErr.message : createErr,
            });
          }
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
        logger.error("[MemoryTools] correct_daily_summary error:", corrError);
        return "Nie udało się zapisać korekty. Spróbuj jeszcze raz.";
      }
    },
  },
  {
    definition: {
      name: "search_brain",
      description:
        'Przeszukaj CAŁY mózg — rozmowy, dokumenty, notatki, wiedzę. Użyj ZAWSZE gdy szukasz informacji. Zastępuje search_memory i search_knowledge. Jeden mózg, jedno narzędzie. Przykłady: "kiedy mówiłem o...", "co było w tym pliku?", "znajdź moje klucze Allegro".',
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Zapytanie do wyszukania (po polsku lub angielsku)",
          },
          date_from: {
            type: "string",
            description: "Data początkowa (YYYY-MM-DD), opcjonalne",
          },
          date_to: {
            type: "string",
            description: "Data końcowa (YYYY-MM-DD), opcjonalne",
          },
          layer: {
            type: "string",
            enum: ["par", "daily", "tacit", "all"],
            description:
              "Warstwa pamięci: par (projekty/zasoby), daily (rozmowy/postęp), tacit (preferencje/wzorce), all (domyślne)",
          },
        },
        required: ["query"],
      },
    },
    execute: async (input, tenantId) => {
      const query = input.query as string;
      const dateFrom = input.date_from as string | undefined;
      const dateTo = input.date_to as string | undefined;
      const layer = (input.layer as "par" | "daily" | "tacit" | "all") || "all";

      logger.info("[MemoryTools] search_brain:", {
        query,
        dateFrom,
        dateTo,
        layer,
        tenantId,
      });

      try {
        const results = await searchBrain(tenantId, query, {
          limit: 10,
          dateFrom,
          dateTo,
          layer,
        });

        return formatBrainResults(results, query);
      } catch (searchError) {
        logger.error("[MemoryTools] search_brain error:", searchError);
        // Fallback to unified search
        try {
          const fallbackResults = await unifiedSearch({
            tenantId,
            query,
            limit: 10,
            dateFrom,
            dateTo,
          });
          return formatUnifiedResultsForResponse(fallbackResults, query);
        } catch {
          return `Nie udało się przeszukać pamięci. Spróbuj jeszcze raz.`;
        }
      }
    },
  },
  {
    definition: {
      name: "search_memory",
      description:
        "[DEPRECATED — użyj search_brain] Przeszukaj pamięć. Przekierowuje do search_brain.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Fraza do wyszukania",
          },
        },
        required: ["query"],
      },
    },
    execute: async (input, tenantId) => {
      const query = input.query as string;
      logger.info("[MemoryTools] search_memory (deprecated → search_brain):", {
        query,
        tenantId,
      });
      const results = await searchBrain(tenantId, query, { limit: 10 });
      return formatBrainResults(results, query);
    },
  },
  {
    definition: {
      name: "remember",
      description:
        'Jawnie zapamiętaj informację w Tacit Knowledge. Użyj gdy user mówi "zapamiętaj że...", "pamiętaj że wolę...", "nie zapomnij o...". Zapisuje w warstwie Tacit (preferencje, wzorce, bezpieczeństwo).',
      input_schema: {
        type: "object" as const,
        properties: {
          content: {
            type: "string",
            description:
              "Informacja do zapamiętania (np. 'User woli React nad Vue', 'Klucz API Allegro to xyz')",
          },
          category: {
            type: "string",
            enum: ["preference", "pattern", "security", "relationship"],
            description:
              "Kategoria: preference (preferencje), pattern (wzorce zachowań), security (hasła/klucze), relationship (relacje)",
          },
        },
        required: ["content"],
      },
    },
    execute: async (input, tenantId) => {
      const content = input.content as string;
      const category =
        (input.category as
          | "preference"
          | "pattern"
          | "security"
          | "relationship") || "preference";

      logger.info("[MemoryTools] remember:", {
        content: content.slice(0, 50),
        category,
        tenantId,
      });

      const result = await remember(tenantId, content, category);
      if (result.success) {
        return `Zapamiętane: "${content.slice(0, 100)}" (kategoria: ${category}).`;
      }
      return `Nie udało się zapamiętać: ${result.error}`;
    },
  },
];
