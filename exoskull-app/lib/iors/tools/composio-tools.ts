/**
 * IORS Composio Tools
 *
 * Tools for connecting and using 400+ SaaS apps via Composio.
 * - composio_connect: Connect an app (Gmail, Calendar, Todoist, etc.)
 * - composio_disconnect: Disconnect a connected app
 * - composio_list_apps: List available & connected apps
 * - composio_action: Execute any Composio action by tool slug
 */

import type { ToolDefinition } from "./index";
import {
  COMPOSIO_TOOLKITS,
  initiateConnection,
  listConnections,
  disconnectAccount,
  executeAction,
} from "@/lib/integrations/composio-adapter";

export const composioTools: ToolDefinition[] = [
  {
    definition: {
      name: "composio_connect",
      description:
        "Połącz aplikację SaaS (Gmail, Google Calendar, Notion, Todoist, Slack, GitHub, Google Drive, Outlook, Trello, Linear). Generuje link OAuth. Użyj gdy user mówi 'połącz Gmail', 'chcę wysyłać emaile', 'podłącz kalendarz'.",
      input_schema: {
        type: "object" as const,
        properties: {
          toolkit: {
            type: "string",
            enum: COMPOSIO_TOOLKITS.map((t) => t.slug),
            description:
              "Toolkit do połączenia. GMAIL = email, GOOGLECALENDAR = kalendarz, NOTION = notatki, TODOIST = zadania, SLACK = chat, GITHUB = repozytoria",
          },
        },
        required: ["toolkit"],
      },
    },
    execute: async (input, tenantId) => {
      const toolkit = input.toolkit as string;
      const meta = COMPOSIO_TOOLKITS.find(
        (t) => t.slug === toolkit.toUpperCase(),
      );
      const name = meta?.name || toolkit;

      try {
        const { redirectUrl } = await initiateConnection(tenantId, toolkit);
        return `Otwórz ten link żeby połączyć ${name}:\n${redirectUrl}\n\nLink jest jednorazowy. Po połączeniu będę mógł korzystać z ${name} w Twoim imieniu.`;
      } catch (err) {
        console.error("[ComposioTools] composio_connect error:", {
          toolkit,
          tenantId,
          error: err instanceof Error ? err.message : err,
        });
        return `Nie udało się wygenerować linku do ${name}. Spróbuj ponownie.`;
      }
    },
  },
  {
    definition: {
      name: "composio_disconnect",
      description:
        "Odłącz podłączoną aplikację SaaS. Użyj gdy user mówi 'odłącz Gmail', 'usuń integrację'.",
      input_schema: {
        type: "object" as const,
        properties: {
          toolkit: {
            type: "string",
            description:
              "Nazwa toolkita do odłączenia (np. GMAIL, GOOGLECALENDAR, NOTION)",
          },
        },
        required: ["toolkit"],
      },
    },
    execute: async (input, tenantId) => {
      const toolkit = (input.toolkit as string).toUpperCase();

      try {
        const connections = await listConnections(tenantId);
        const match = connections.find(
          (c) => c.toolkit.toUpperCase() === toolkit,
        );

        if (!match) {
          return `Nie znaleziono aktywnego połączenia z ${toolkit}.`;
        }

        const ok = await disconnectAccount(match.id);
        if (ok) {
          return `Odłączono ${toolkit}. Nie mam już dostępu do tego konta.`;
        }
        return `Nie udało się odłączyć ${toolkit}. Spróbuj ponownie.`;
      } catch (err) {
        console.error("[ComposioTools] composio_disconnect error:", {
          toolkit,
          tenantId,
          error: err instanceof Error ? err.message : err,
        });
        return `Błąd przy odłączaniu ${toolkit}.`;
      }
    },
  },
  {
    definition: {
      name: "composio_list_apps",
      description:
        "Pokaż dostępne i podłączone aplikacje SaaS (Composio). Użyj gdy user pyta 'jakie aplikacje?', 'co jest podłączone?', 'lista integracji'.",
      input_schema: {
        type: "object" as const,
        properties: {},
      },
    },
    execute: async (_input, tenantId) => {
      try {
        const connections = await listConnections(tenantId);
        const connectedSlugs = new Set(
          connections.map((c) => c.toolkit.toUpperCase()),
        );

        const lines = COMPOSIO_TOOLKITS.map((t) => {
          const connected = connectedSlugs.has(t.slug);
          const status = connected ? "✅ podłączono" : "⬜ dostępne";
          return `${status} | ${t.name} — ${t.description}`;
        });

        return `Aplikacje SaaS (via Composio):\n${lines.join("\n")}\n\nPowiedz "połącz [nazwa]" żeby podłączyć nową aplikację.`;
      } catch (err) {
        console.error("[ComposioTools] composio_list_apps error:", {
          tenantId,
          error: err instanceof Error ? err.message : err,
        });
        return "Nie udało się pobrać listy aplikacji.";
      }
    },
  },
  {
    definition: {
      name: "composio_action",
      description:
        'Wykonaj dowolną akcję w podłączonej aplikacji SaaS. Np. "GMAIL_SEND_EMAIL", "GOOGLECALENDAR_CREATE_EVENT", "NOTION_CREATE_PAGE", "TODOIST_CREATE_TASK". Użyj gdy user prosi o konkretną operację w podłączonej aplikacji.',
      input_schema: {
        type: "object" as const,
        properties: {
          tool_slug: {
            type: "string",
            description:
              "Nazwa akcji Composio (np. GMAIL_SEND_EMAIL, GOOGLECALENDAR_CREATE_EVENT, TODOIST_CREATE_TASK, NOTION_CREATE_PAGE, SLACK_SEND_MESSAGE, GOOGLEDRIVE_UPLOAD_FILE). Format: TOOLKIT_NAZWA_AKCJI. Najczęściej używane: GMAIL_SEND_EMAIL (to, subject, body), GOOGLECALENDAR_CREATE_EVENT (title, start_time, end_time), TODOIST_CREATE_TASK (content, due_string), NOTION_CREATE_PAGE (title, content).",
          },
          arguments: {
            type: "object",
            description: "Parametry akcji jako obiekt JSON",
          },
        },
        required: ["tool_slug", "arguments"],
      },
    },
    execute: async (input, tenantId) => {
      const toolSlug = input.tool_slug as string;
      const args = (input.arguments as Record<string, unknown>) || {};

      try {
        const result = await executeAction(toolSlug, tenantId, args);

        if (result.success) {
          return `Wykonano ${toolSlug}. Wynik: ${JSON.stringify(result.data).slice(0, 500)}`;
        }
        return `Nie udało się wykonać ${toolSlug}: ${result.error}`;
      } catch (err) {
        console.error("[ComposioTools] composio_action error:", {
          toolSlug,
          tenantId,
          error: err instanceof Error ? err.message : err,
        });
        return `Błąd: ${err instanceof Error ? err.message : "nieznany"}`;
      }
    },
  },
];
