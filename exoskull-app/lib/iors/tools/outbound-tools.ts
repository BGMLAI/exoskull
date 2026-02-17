/**
 * IORS Outbound Communication Tools
 *
 * Allows AI to proactively call or message the user.
 */

import type { ToolDefinition } from "./shared";
import { callUser, isUserOnline } from "@/lib/communication/outbound-caller";

export const outboundTools: ToolDefinition[] = [
  {
    definition: {
      name: "call_user",
      description:
        "Zadzwon do uzytkownika (VAPI outbound call). Uzywaj TYLKO w sytuacjach: pilny alert, morning briefing, zaplanowane przypomnienie. NIE uzywaj bez wyraznej potrzeby.",
      input_schema: {
        type: "object" as const,
        properties: {
          reason: {
            type: "string",
            enum: [
              "morning_briefing",
              "alert",
              "emergency",
              "reminder",
              "follow_up",
            ],
            description: "Powod dzwonienia",
          },
          message: {
            type: "string",
            description: "Co powiedziec uzytkownikowi na poczatku rozmowy",
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high", "critical"],
            description: "Priorytet (critical = natychmiastowy)",
          },
        },
        required: ["reason", "message"],
      },
    },
    execute: async (input, tenantId) => {
      const reason = input.reason as
        | "morning_briefing"
        | "alert"
        | "emergency"
        | "reminder"
        | "follow_up";
      const priority =
        (input.priority as "low" | "normal" | "high" | "critical") || "normal";

      // Safety check — don't call during sleep hours
      const hour = new Date().getHours();
      if (hour >= 23 || hour < 7) {
        if (priority !== "critical" && reason !== "emergency") {
          return "Nie dzwonie — godziny nocne (23:00-07:00). Tylko pilne sytuacje moga przerwac sen.";
        }
      }

      // Check if user is online (might not need a call)
      const online = await isUserOnline(tenantId);
      if (online && priority !== "critical") {
        return `Uzytkownik jest online — wyslij wiadomosc w chacie zamiast dzwonic.`;
      }

      try {
        const result = await callUser({
          tenantId,
          reason,
          message: input.message as string,
          priority,
        });

        if (result.success) {
          return `Dzwonie do uzytkownika (call ID: ${result.callId}). Powod: ${reason}. Wiadomosc: "${(input.message as string).slice(0, 100)}"`;
        }

        return `Nie udalo sie zadzwonic: ${result.error}`;
      } catch (err) {
        return `Blad dzwonienia: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
];
