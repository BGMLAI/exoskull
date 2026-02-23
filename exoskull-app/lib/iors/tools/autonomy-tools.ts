/**
 * IORS Autonomy Tools
 *
 * Tools for managing IORS autonomy permissions through conversation.
 * - propose_autonomy: IORS proposes a new permission to the user
 * - grant_autonomy: User grants a permission (called after user confirms)
 * - revoke_autonomy: User revokes a permission
 */

import type { ToolDefinition } from "./shared";
import {
  proposePermission,
  grantPermission,
  revokePermission,
  listPermissions,
} from "../autonomy";
import type { AutonomyActionType, AutonomyDomain } from "../types";
import {
  runByzantineConsensus,
  requiresConsensus,
} from "@/lib/ai/consensus/byzantine";
import { logger } from "@/lib/logger";

export const autonomyTools: ToolDefinition[] = [
  {
    definition: {
      name: "propose_autonomy",
      description:
        "Zaproponuj uzytkownikowi nowe uprawnienie autonomiczne. Uzyj gdy IORS chce zaczac robic cos automatycznie (np. 'moge automatycznie logowac Twoj sen?').",
      input_schema: {
        type: "object" as const,
        properties: {
          action_type: {
            type: "string",
            enum: [
              "log",
              "message",
              "schedule",
              "call",
              "create_mod",
              "purchase",
              "cancel",
              "share_data",
            ],
            description: "Typ akcji autonomicznej",
          },
          domain: {
            type: "string",
            enum: [
              "health",
              "finance",
              "work",
              "social",
              "home",
              "business",
              "*",
            ],
            description:
              "Domena: health, finance, work, social, home, business, * (wszystko)",
            default: "*",
          },
        },
        required: ["action_type"],
      },
    },
    execute: async (input) => {
      const actionType = input.action_type as AutonomyActionType;
      const domain = (input.domain as AutonomyDomain) || "*";
      return proposePermission(actionType, domain);
    },
  },
  {
    definition: {
      name: "grant_autonomy",
      description:
        "Przyznaj uprawnienie autonomiczne po potwierdzeniu przez uzytkownika. Uzyj PO tym jak user powie 'tak', 'ok', 'dawaj', etc.",
      input_schema: {
        type: "object" as const,
        properties: {
          action_type: {
            type: "string",
            enum: [
              "log",
              "message",
              "schedule",
              "call",
              "create_mod",
              "purchase",
              "cancel",
              "share_data",
            ],
            description: "Typ akcji",
          },
          domain: {
            type: "string",
            description: "Domena",
            default: "*",
          },
          threshold_amount: {
            type: "number",
            description: "Maksymalny koszt (PLN) per akcja",
          },
          requires_confirmation: {
            type: "boolean",
            description:
              "Czy wymagac potwierdzenia przed kazda akcja (true = pytaj, false = rob sam)",
            default: false,
          },
        },
        required: ["action_type"],
      },
    },
    execute: async (input, tenantId) => {
      const actionType = input.action_type as AutonomyActionType;
      const domain = (input.domain as AutonomyDomain) || "*";

      // Byzantine consensus gate — multi-model validation before granting autonomy
      if (requiresConsensus("grant_autonomy")) {
        try {
          const consensus = await runByzantineConsensus({
            type: "grant_autonomy",
            description: `Grant autonomy: ${actionType} in domain ${domain}`,
            tenantId,
            metadata: { actionType, domain, threshold: input.threshold_amount },
          });
          if (consensus.decision === "reject") {
            logger.warn("[AutonomyTools] Byzantine rejected grant_autonomy:", {
              actionType,
              domain,
              votes: consensus.votes.length,
            });
            return `Przyznanie uprawnienia "${actionType}" zablokowane przez system bezpieczeństwa. Powód: ${consensus.reasoning}`;
          }
        } catch (err) {
          logger.warn("[AutonomyTools] Byzantine check failed (proceeding):", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      await grantPermission(tenantId, actionType, domain, {
        threshold_amount: input.threshold_amount as number | undefined,
        requires_confirmation:
          (input.requires_confirmation as boolean) ?? false,
        granted_via: "conversation",
      });

      const domainLabel = domain === "*" ? "wszystkie domeny" : domain;
      return `Gotowe! Mam teraz uprawnienie "${actionType}" w domenie "${domainLabel}". Dzieki za zaufanie.`;
    },
  },
  {
    definition: {
      name: "revoke_autonomy",
      description:
        "Cofnij uprawnienie autonomiczne. Uzytkownik chce zabrac IORS jakies uprawnienie.",
      input_schema: {
        type: "object" as const,
        properties: {
          action_type: {
            type: "string",
            description: "Typ akcji do cofniecia",
          },
          domain: {
            type: "string",
            description: "Domena",
            default: "*",
          },
        },
        required: ["action_type"],
      },
    },
    execute: async (input, tenantId) => {
      const actionType = input.action_type as AutonomyActionType;
      const domain = (input.domain as AutonomyDomain) || "*";

      await revokePermission(tenantId, actionType, domain);
      return `OK, cofnalem uprawnienie "${actionType}" w domenie "${domain}". Nie bede tego robil bez pytania.`;
    },
  },
  {
    definition: {
      name: "list_autonomy",
      description:
        "Pokaz aktualne uprawnienia autonomiczne IORS. Uzytkownik pyta 'co mozesz robic sam?' lub 'jakie masz uprawnienia?'.",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    execute: async (_input, tenantId) => {
      const perms = await listPermissions(tenantId);

      if (perms.length === 0) {
        return "Nie mam zadnych uprawnien autonomicznych. Moge jedynie logowac dane. Chcesz mi dac wiecej swobody?";
      }

      const lines = perms.map((p) => {
        const status = p.granted ? "aktywne" : "cofniete";
        const confirm = p.requires_confirmation
          ? " (z potwierdzeniem)"
          : " (bez pytania)";
        const limit = p.threshold_amount
          ? ` (max ${p.threshold_amount} PLN)`
          : "";
        return `- ${p.action_type} [${p.domain}]: ${status}${confirm}${limit}`;
      });

      return `Moje aktualne uprawnienia:\n${lines.join("\n")}`;
    },
  },
];
