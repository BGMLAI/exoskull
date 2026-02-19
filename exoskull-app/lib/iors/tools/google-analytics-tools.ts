/**
 * Google Analytics GA4 IORS Tools
 *
 * 3 tools: get_analytics_report, get_analytics_realtime, list_analytics_properties
 */

import type { ToolDefinition } from "./shared";
import {
  listAnalyticsProperties,
  getAnalyticsReport,
  getAnalyticsRealtime,
} from "@/lib/integrations/google-analytics-adapter";

export const googleAnalyticsTools: ToolDefinition[] = [
  {
    definition: {
      name: "get_analytics_report",
      description:
        "Pobierz raport Google Analytics GA4 (sesje, użytkownicy, odsłony, źródła ruchu).",
      input_schema: {
        type: "object" as const,
        properties: {
          property_id: {
            type: "string",
            description: "GA4 Property ID (z list_analytics_properties)",
          },
          metrics: {
            type: "array",
            items: { type: "string" },
            description:
              "Metryki: sessions, totalUsers, screenPageViews, bounceRate, averageSessionDuration, conversions",
          },
          dimensions: {
            type: "array",
            items: { type: "string" },
            description:
              "Wymiary: date, country, sessionSource, deviceCategory, pagePath",
          },
          date_range: {
            type: "string",
            enum: [
              "today",
              "yesterday",
              "last_7_days",
              "last_30_days",
              "this_month",
              "custom",
            ],
            description: "Zakres dat (domyślnie last_7_days)",
          },
          start_date: {
            type: "string",
            description: "Start (YYYY-MM-DD, dla custom)",
          },
          end_date: {
            type: "string",
            description: "Koniec (YYYY-MM-DD, dla custom)",
          },
        },
        required: ["property_id"],
      },
    },
    execute: async (input, tenantId) => {
      const range = (input.date_range as string) || "last_7_days";
      let startDate: string;
      let endDate: string;

      if (range === "custom" && input.start_date && input.end_date) {
        startDate = input.start_date as string;
        endDate = input.end_date as string;
      } else {
        endDate = "today";
        const rangeMap: Record<string, string> = {
          today: "today",
          yesterday: "yesterday",
          last_7_days: "7daysAgo",
          last_30_days: "30daysAgo",
          this_month: "firstDayOfMonth",
        };
        startDate = rangeMap[range] || "7daysAgo";
        if (range === "yesterday") endDate = "yesterday";
      }

      const metrics = (input.metrics as string[]) || [
        "sessions",
        "totalUsers",
        "screenPageViews",
      ];
      const dimensions = (input.dimensions as string[]) || ["date"];

      const result = await getAnalyticsReport(
        tenantId,
        input.property_id as string,
        metrics,
        dimensions,
        { startDate, endDate },
      );
      if (!result.ok) return result.error || "Błąd pobierania raportu.";
      return result.formatted!;
    },
  },
  {
    definition: {
      name: "get_analytics_realtime",
      description:
        "Sprawdź ile użytkowników jest aktualnie na stronie (real-time).",
      input_schema: {
        type: "object" as const,
        properties: {
          property_id: {
            type: "string",
            description: "GA4 Property ID",
          },
        },
        required: ["property_id"],
      },
    },
    execute: async (input, tenantId) => {
      const result = await getAnalyticsRealtime(
        tenantId,
        input.property_id as string,
      );
      if (!result.ok) return result.error || "Błąd pobierania danych realtime.";
      return result.formatted!;
    },
  },
  {
    definition: {
      name: "list_analytics_properties",
      description:
        "Pokaż listę kont i właściwości Google Analytics GA4 użytkownika.",
      input_schema: {
        type: "object" as const,
        properties: {},
      },
    },
    execute: async (_input, tenantId) => {
      const result = await listAnalyticsProperties(tenantId);
      if (!result.ok) return result.error || "Błąd pobierania właściwości GA4.";
      return result.formatted!;
    },
  },
];
