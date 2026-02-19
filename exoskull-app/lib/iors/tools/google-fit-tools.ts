/**
 * IORS Google Fit Tools
 *
 * 4 tools: get_health_data (expanded), log_weight, log_workout, log_water
 */

import type { ToolDefinition } from "./shared";
import {
  getHealthSummary,
  getSteps,
  getHeartRate,
  getSleepSessions,
  getWeight,
  getBloodPressure,
  getBloodGlucose,
  logWeight,
  logWorkout,
  logWaterIntake,
} from "@/lib/integrations/google-fit-adapter";

export const googleFitTools: ToolDefinition[] = [
  {
    definition: {
      name: "get_health_data",
      description:
        "Pobierz dane zdrowotne z Google Fit: kroki, tętno, sen, kalorie, wagę, ciśnienie, glukozę.",
      input_schema: {
        type: "object" as const,
        properties: {
          days_back: {
            type: "number",
            description: "Ile dni wstecz pobrać dane (domyślnie 7)",
          },
          data_type: {
            type: "string",
            enum: [
              "summary",
              "steps",
              "heart_rate",
              "sleep",
              "weight",
              "blood_pressure",
              "blood_glucose",
            ],
            description:
              "Typ danych: summary (wszystko), steps, heart_rate, sleep, weight, blood_pressure, blood_glucose",
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
            return result.error || "Nie udało się pobrać danych z Google Fit.";
          return result.summary!;
        }

        if (dataType === "steps") {
          const result = await getSteps(tenantId, start, end);
          if (!result.ok) return result.error || "Błąd pobierania kroków.";
          return `Kroki (${daysBack} dni):\n${result.steps!.map((s) => `  ${s.date}: ${s.count.toLocaleString()}`).join("\n")}`;
        }

        if (dataType === "heart_rate") {
          const result = await getHeartRate(tenantId, start, end);
          if (!result.ok) return result.error || "Błąd pobierania tętna.";
          if (!result.data?.length) return "Brak danych o tętnie.";
          return `Tętno (${daysBack} dni):\n${result.data.map((d) => `  ${d.date}: avg ${d.avg} BPM (${d.min}-${d.max})`).join("\n")}`;
        }

        if (dataType === "sleep") {
          const result = await getSleepSessions(tenantId, start, end);
          if (!result.ok) return result.error || "Błąd pobierania snu.";
          if (!result.sessions?.length) return "Brak danych o śnie.";
          return `Sen (${daysBack} dni):\n${result.sessions.map((s) => `  ${s.date}: ${s.durationHours}h`).join("\n")}`;
        }

        if (dataType === "weight") {
          const result = await getWeight(tenantId, start, end);
          if (!result.ok) return result.error || "Błąd pobierania wagi.";
          if (!result.data?.length) return "Brak danych o wadze.";
          return `Waga (${daysBack} dni):\n${result.data.map((d) => `  ${d.date}: ${d.kg} kg`).join("\n")}`;
        }

        if (dataType === "blood_pressure") {
          const result = await getBloodPressure(tenantId, start, end);
          if (!result.ok) return result.error || "Błąd pobierania ciśnienia.";
          if (!result.data?.length) return "Brak danych o ciśnieniu krwi.";
          return `Ciśnienie (${daysBack} dni):\n${result.data.map((d) => `  ${d.date}: ${d.systolic}/${d.diastolic} mmHg`).join("\n")}`;
        }

        if (dataType === "blood_glucose") {
          const result = await getBloodGlucose(tenantId, start, end);
          if (!result.ok) return result.error || "Błąd pobierania glukozy.";
          if (!result.data?.length) return "Brak danych o glukozie.";
          return `Glukoza (${daysBack} dni):\n${result.data.map((d) => `  ${d.date}: ${d.mmolL} mmol/L`).join("\n")}`;
        }

        return "Nieznany typ danych. Użyj: summary, steps, heart_rate, sleep, weight, blood_pressure, blood_glucose.";
      } catch (err) {
        return `Błąd Google Fit: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
  {
    definition: {
      name: "log_weight",
      description: "Zapisz pomiar wagi w Google Fit.",
      input_schema: {
        type: "object" as const,
        properties: {
          weight_kg: {
            type: "number",
            description: "Waga w kilogramach (np. 75.5)",
          },
        },
        required: ["weight_kg"],
      },
    },
    execute: async (input, tenantId) => {
      try {
        const result = await logWeight(tenantId, input.weight_kg as number);
        if (!result.ok) return result.error || "Nie udało się zapisać wagi.";
        return result.formatted!;
      } catch (err) {
        return `Błąd: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
  {
    definition: {
      name: "log_workout",
      description: "Zapisz trening w Google Fit.",
      input_schema: {
        type: "object" as const,
        properties: {
          activity_type: {
            type: "string",
            description:
              "Typ aktywności: running, walking, cycling, swimming, yoga, hiking, gym, dancing, rowing, elliptical",
          },
          duration_minutes: {
            type: "number",
            description: "Czas trwania w minutach",
          },
          calories: {
            type: "number",
            description: "Spalone kalorie (opcjonalnie)",
          },
        },
        required: ["activity_type", "duration_minutes"],
      },
    },
    execute: async (input, tenantId) => {
      try {
        const result = await logWorkout(
          tenantId,
          input.activity_type as string,
          input.duration_minutes as number,
          input.calories as number | undefined,
        );
        if (!result.ok)
          return result.error || "Nie udało się zapisać treningu.";
        return result.formatted!;
      } catch (err) {
        return `Błąd: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
  {
    definition: {
      name: "log_water",
      description: "Zapisz spożycie wody w Google Fit.",
      input_schema: {
        type: "object" as const,
        properties: {
          amount_ml: {
            type: "number",
            description: "Ilość wody w mililitrach (np. 250 = szklanka)",
          },
        },
        required: ["amount_ml"],
      },
    },
    execute: async (input, tenantId) => {
      try {
        const result = await logWaterIntake(
          tenantId,
          input.amount_ml as number,
        );
        if (!result.ok) return result.error || "Nie udało się zapisać wody.";
        return result.formatted!;
      } catch (err) {
        return `Błąd: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
];
