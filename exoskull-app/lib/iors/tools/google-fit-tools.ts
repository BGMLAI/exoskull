/**
 * IORS Google Fit Tools
 *
 * Exposes Google Fit adapter functions as IORS tools callable by AI.
 */

import type { ToolDefinition } from "./index";
import {
  getHealthSummary,
  getSteps,
  getHeartRate,
  getSleepSessions,
} from "@/lib/integrations/google-fit-adapter";

export const googleFitTools: ToolDefinition[] = [
  {
    definition: {
      name: "get_health_data",
      description:
        "Pobierz dane zdrowotne z Google Fit: kroki, tetno, sen, kalorie. Uzywaj gdy user pyta o zdrowie, aktywnosc, sen, ilosc krokow.",
      input_schema: {
        type: "object" as const,
        properties: {
          days_back: {
            type: "number",
            description: "Ile dni wstecz pobrac dane (domyslnie 7)",
          },
          data_type: {
            type: "string",
            enum: ["summary", "steps", "heart_rate", "sleep"],
            description:
              "Typ danych: summary (wszystko), steps, heart_rate, sleep",
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      const daysBack = (input.days_back as number) || 7;
      const dataType = (input.data_type as string) || "summary";
      const end = new Date();
      const start = new Date(Date.now() - daysBack * 86400000);

      try {
        if (dataType === "summary" || !dataType) {
          const result = await getHealthSummary(tenantId, daysBack);
          if (!result.ok)
            return (
              result.error ||
              "Nie udalo sie pobrac danych z Google Fit. Sprawdz polaczenie."
            );
          return result.summary!;
        }

        if (dataType === "steps") {
          const result = await getSteps(tenantId, start, end);
          if (!result.ok) return result.error || "Blad pobierania krokow.";
          return `Kroki (${daysBack} dni):\n${result.steps!.map((s) => `  ${s.date}: ${s.count.toLocaleString()}`).join("\n")}`;
        }

        if (dataType === "heart_rate") {
          const result = await getHeartRate(tenantId, start, end);
          if (!result.ok) return result.error || "Blad pobierania tetna.";
          if (!result.data?.length) return "Brak danych o tetnie.";
          return `Tetno (${daysBack} dni):\n${result.data.map((d) => `  ${d.date}: avg ${d.avg} BPM (${d.min}-${d.max})`).join("\n")}`;
        }

        if (dataType === "sleep") {
          const result = await getSleepSessions(tenantId, start, end);
          if (!result.ok) return result.error || "Blad pobierania snu.";
          if (!result.sessions?.length) return "Brak danych o snie.";
          return `Sen (${daysBack} dni):\n${result.sessions.map((s) => `  ${s.date}: ${s.durationHours}h`).join("\n")}`;
        }

        return "Nieznany typ danych. Uzyj: summary, steps, heart_rate, sleep.";
      } catch (err) {
        return `Blad Google Fit: ${err instanceof Error ? err.message : err}. Sprawdz polaczenie w ustawieniach.`;
      }
    },
  },
];
