/**
 * Google Ads IORS Tools
 *
 * 5 tools: list_ad_campaigns, get_ad_performance, pause/enable_ad_campaign, get_ad_account_summary
 */

import type { ToolDefinition } from "./shared";
import {
  listAdCampaigns,
  getAdPerformance,
  pauseAdCampaign,
  enableAdCampaign,
  getAdAccountSummary,
} from "@/lib/rigs/google-ads/client";

export const googleAdsTools: ToolDefinition[] = [
  {
    definition: {
      name: "list_ad_campaigns",
      description: "Pokaż kampanie Google Ads użytkownika.",
      input_schema: {
        type: "object" as const,
        properties: {
          status: {
            type: "string",
            enum: ["ENABLED", "PAUSED", "ALL"],
            description: "Filtruj po statusie (domyślnie ALL)",
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      const result = await listAdCampaigns(
        tenantId,
        (input.status as string) || "ALL",
      );
      if (!result.ok) return result.error || "Błąd pobierania kampanii.";
      return result.formatted!;
    },
  },
  {
    definition: {
      name: "get_ad_performance",
      description:
        "Pobierz wyniki kampanii Google Ads (wyświetlenia, kliknięcia, koszty).",
      input_schema: {
        type: "object" as const,
        properties: {
          campaign_id: { type: "string", description: "ID kampanii" },
          date_range: {
            type: "string",
            enum: [
              "TODAY",
              "YESTERDAY",
              "LAST_7_DAYS",
              "LAST_30_DAYS",
              "THIS_MONTH",
            ],
            description: "Zakres dat (domyślnie LAST_7_DAYS)",
          },
        },
        required: ["campaign_id"],
      },
    },
    execute: async (input, tenantId) => {
      const result = await getAdPerformance(
        tenantId,
        input.campaign_id as string,
        (input.date_range as string) || "LAST_7_DAYS",
      );
      if (!result.ok) return result.error || "Błąd pobierania wyników.";
      return result.formatted!;
    },
  },
  {
    definition: {
      name: "pause_ad_campaign",
      description: "Wstrzymaj kampanię Google Ads.",
      input_schema: {
        type: "object" as const,
        properties: {
          campaign_id: {
            type: "string",
            description: "ID kampanii do wstrzymania",
          },
        },
        required: ["campaign_id"],
      },
    },
    execute: async (input, tenantId) => {
      const result = await pauseAdCampaign(
        tenantId,
        input.campaign_id as string,
      );
      if (!result.ok)
        return result.error || "Nie udało się wstrzymać kampanii.";
      return "Kampania wstrzymana (PAUSED).";
    },
  },
  {
    definition: {
      name: "enable_ad_campaign",
      description: "Włącz/wznów kampanię Google Ads.",
      input_schema: {
        type: "object" as const,
        properties: {
          campaign_id: {
            type: "string",
            description: "ID kampanii do włączenia",
          },
        },
        required: ["campaign_id"],
      },
    },
    execute: async (input, tenantId) => {
      const result = await enableAdCampaign(
        tenantId,
        input.campaign_id as string,
      );
      if (!result.ok) return result.error || "Nie udało się włączyć kampanii.";
      return "Kampania włączona (ENABLED).";
    },
  },
  {
    definition: {
      name: "get_ad_account_summary",
      description:
        "Pokaż podsumowanie konta Google Ads (wydatki, wyświetlenia, kliknięcia, konwersje).",
      input_schema: {
        type: "object" as const,
        properties: {},
      },
    },
    execute: async (_input, tenantId) => {
      const result = await getAdAccountSummary(tenantId);
      if (!result.ok) return result.error || "Błąd pobierania podsumowania.";
      return result.formatted!;
    },
  },
];
