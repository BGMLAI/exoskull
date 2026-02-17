/**
 * IORS Integration Tools
 *
 * Tools for connecting external services (rigs) via conversation.
 * - connect_rig: Generate OAuth link for a rig
 * - list_integrations: Show available integrations
 */

import type { ToolDefinition } from "./shared";

export const integrationTools: ToolDefinition[] = [
  {
    definition: {
      name: "connect_rig",
      description:
        "Połącz zewnętrzną usługę (Google Calendar, Oura Ring, Todoist, Notion, Fitbit, Spotify, Microsoft 365). Generuje link do autoryzacji który user otwiera w przeglądarce. Użyj gdy user chce podłączyć integrację lub mówi o urządzeniu/aplikacji.",
      input_schema: {
        type: "object" as const,
        properties: {
          rig_slug: {
            type: "string",
            enum: [
              "google",
              "oura",
              "fitbit",
              "todoist",
              "notion",
              "spotify",
              "microsoft-365",
            ],
            description:
              "Slug integracji do połączenia. google = Gmail + Calendar + Drive + Tasks",
          },
        },
        required: ["rig_slug"],
      },
    },
    execute: async (input, tenantId) => {
      const rigSlug = input.rig_slug as string;
      try {
        const { generateMagicConnectLink } =
          await import("@/lib/rigs/in-chat-connector");
        const { url, rigName } = await generateMagicConnectLink(
          tenantId,
          rigSlug,
        );
        return `Otwórz ten link żeby połączyć ${rigName}:\n${url}\n\nLink ważny 15 minut.`;
      } catch (err) {
        console.error("[IntegrationTools] connect_rig error:", {
          rigSlug,
          error: err instanceof Error ? err.message : err,
        });
        return `Nie udało się wygenerować linku do ${rigSlug}. Spróbuj ponownie.`;
      }
    },
  },
  {
    definition: {
      name: "list_integrations",
      description:
        "Pokaż listę dostępnych integracji które user może podłączyć do ExoSkull. Użyj gdy user pyta 'co mogę podłączyć?' lub 'jakie integracje?'",
      input_schema: {
        type: "object" as const,
        properties: {},
      },
    },
    execute: async () => {
      const { getAvailableRigs } = await import("@/lib/rigs/in-chat-connector");
      const rigs = getAvailableRigs();
      const list = rigs.map((r) => `• ${r.name} — ${r.description}`).join("\n");
      return `Dostępne integracje:\n${list}\n\nPowiedz "połącz [nazwa]" żeby podłączyć.`;
    },
  },
];
