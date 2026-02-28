/**
 * IORS Integration Tools
 *
 * Tools for connecting external services:
 * - connect_rig: Connect pre-built integrations (Google, Oura, etc.)
 * - connect_service: AI Superintegrator — connect ANY service dynamically
 * - list_integrations: Show all available + connected integrations
 * - use_service: Make API calls to connected services
 */

import type { ToolDefinition } from "./shared";

import { logger } from "@/lib/logger";
export const integrationTools: ToolDefinition[] = [
  // Pre-built rig connections (existing)
  {
    definition: {
      name: "connect_rig",
      description:
        "Połącz znaną usługę (Google, Oura, Todoist, Notion, Fitbit, Spotify, Microsoft 365). Dla ZNANYCH usług z gotowym adapterem.",
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
              "Slug integracji. google = Gmail + Calendar + Drive + Tasks",
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
        logger.error("[IntegrationTools] connect_rig error:", {
          rigSlug,
          error: err instanceof Error ? err.message : err,
        });
        return `Nie udało się wygenerować linku do ${rigSlug}. Spróbuj ponownie.`;
      }
    },
  },

  // AI Superintegrator — connect ANY service
  {
    definition: {
      name: "connect_service",
      description:
        "AI Superintegrator — połącz DOWOLNĄ usługę (nie tylko znane rig-i). " +
        "Agent najpierw szuka docs API usługi (web search), ustala metodę autoryzacji, " +
        "a potem wywołuje connect_service z odpowiednimi parametrami. " +
        "Obsługuje OAuth2, API key, webhook. " +
        "Po połączeniu użyj build_tool aby stworzyć narzędzie do korzystania z usługi.",
      input_schema: {
        type: "object" as const,
        properties: {
          service_name: {
            type: "string",
            description: "Nazwa usługi (np. 'Stripe', 'Airtable', 'HubSpot')",
          },
          service_slug: {
            type: "string",
            description: "Slug usługi (snake_case, np. 'stripe', 'airtable')",
          },
          auth_method: {
            type: "string",
            enum: ["oauth2", "api_key", "webhook"],
            description: "Metoda autoryzacji: oauth2, api_key, lub webhook",
          },
          api_base_url: {
            type: "string",
            description: "Bazowy URL API (np. 'https://api.stripe.com/v1')",
          },
          authorization_url: {
            type: "string",
            description: "URL autoryzacji OAuth2 (wymagane dla oauth2)",
          },
          token_url: {
            type: "string",
            description: "URL wymiany tokena OAuth2 (wymagane dla oauth2)",
          },
          client_id: {
            type: "string",
            description: "Client ID OAuth2 (wymagane dla oauth2)",
          },
          client_secret: {
            type: "string",
            description: "Client secret OAuth2 (opcjonalne, szyfrowane)",
          },
          scopes: {
            type: "array",
            items: { type: "string" },
            description: "OAuth2 scopes (np. ['read', 'write'])",
          },
          api_key: {
            type: "string",
            description: "Klucz API (wymagane dla api_key, szyfrowany)",
          },
        },
        required: ["service_name", "service_slug", "auth_method"],
      },
    },
    execute: async (input, tenantId) => {
      try {
        const { connectService } =
          await import("@/lib/integrations/superintegrator");
        const result = await connectService(tenantId, {
          service_name: input.service_name as string,
          service_slug: input.service_slug as string,
          auth_method: input.auth_method as "oauth2" | "api_key" | "webhook",
          api_base_url: input.api_base_url as string | undefined,
          authorization_url: input.authorization_url as string | undefined,
          token_url: input.token_url as string | undefined,
          client_id: input.client_id as string | undefined,
          client_secret: input.client_secret as string | undefined,
          scopes: input.scopes as string[] | undefined,
          api_key: input.api_key as string | undefined,
        });

        if (!result.success) {
          return `Błąd łączenia ${input.service_name}: ${result.error}`;
        }

        let response = `${input.service_name} — `;
        if (result.auth_url) {
          response += `Autoryzacja wymagana. ${result.action_required}`;
        } else if (result.webhook_url) {
          response += `Webhook URL: ${result.webhook_url}\n${result.action_required}`;
        } else {
          response += `Połączono! Użyj build_tool aby stworzyć narzędzie do korzystania z ${input.service_name}.`;
        }
        return response;
      } catch (err) {
        logger.error("[IntegrationTools] connect_service error:", {
          service: input.service_slug,
          error: err instanceof Error ? err.message : err,
        });
        return `Błąd: ${err instanceof Error ? err.message : "Nieznany błąd"}`;
      }
    },
  },

  // List all integrations (pre-built + dynamic)
  {
    definition: {
      name: "list_integrations",
      description:
        "Pokaż listę wszystkich integracji: dostępne gotowe rig-i + podłączone usługi (Superintegrator).",
      input_schema: {
        type: "object" as const,
        properties: {},
      },
    },
    execute: async (_input, tenantId) => {
      const parts: string[] = [];

      // Pre-built rigs
      try {
        const { getAvailableRigs } =
          await import("@/lib/rigs/in-chat-connector");
        const rigs = getAvailableRigs();
        parts.push("Gotowe integracje (connect_rig):");
        parts.push(
          rigs.map((r) => `  • ${r.name} — ${r.description}`).join("\n"),
        );
      } catch {
        parts.push("Gotowe integracje: (nie udało się załadować)");
      }

      // Dynamic connections (Superintegrator)
      try {
        const { listConnections } =
          await import("@/lib/integrations/superintegrator");
        const connections = await listConnections(tenantId);
        if (connections.length > 0) {
          parts.push("\nPodłączone usługi (Superintegrator):");
          parts.push(
            connections
              .map(
                (c) => `  • ${c.service_name} [${c.auth_method}] — ${c.status}`,
              )
              .join("\n"),
          );
        }
      } catch {
        // Superintegrator not available yet
      }

      parts.push('\nAby podłączyć nową usługę: "podłącz [nazwa]"');
      parts.push("Dowolna usługa z API: użyj connect_service");
      return parts.join("\n");
    },
  },

  // Use connected service API
  {
    definition: {
      name: "use_service",
      description:
        "Wykonaj zapytanie API do podłączonej usługi. Używa zapisanych credentials (token/klucz API). " +
        "Najpierw sprawdź listę podłączonych usług za pomocą list_integrations.",
      input_schema: {
        type: "object" as const,
        properties: {
          service_slug: {
            type: "string",
            description: "Slug podłączonej usługi (np. 'stripe', 'airtable')",
          },
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
            description: "HTTP method",
          },
          path: {
            type: "string",
            description: "Ścieżka API (np. '/customers', '/v1/records')",
          },
          body: {
            type: "object",
            description: "Body requestu (dla POST/PUT/PATCH)",
          },
          query_params: {
            type: "object",
            description: "Query parameters (np. { limit: 10 })",
          },
        },
        required: ["service_slug", "method", "path"],
      },
    },
    execute: async (input, tenantId) => {
      try {
        const { getServiceCredentials } =
          await import("@/lib/integrations/superintegrator");
        const creds = await getServiceCredentials(
          tenantId,
          input.service_slug as string,
        );

        if (!creds) {
          return `Usługa "${input.service_slug}" nie jest podłączona. Użyj connect_service najpierw.`;
        }

        const baseUrl = creds.api_base_url as string;
        const path = input.path as string;
        const method = input.method as string;

        // Build URL with query params
        let url = baseUrl ? `${baseUrl}${path}` : path;
        if (input.query_params) {
          const params = new URLSearchParams(
            input.query_params as Record<string, string>,
          );
          url += `?${params.toString()}`;
        }

        // Build headers with auth
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (creds.access_token) {
          headers["Authorization"] = `Bearer ${creds.access_token}`;
        } else if (creds.api_key) {
          headers["Authorization"] = `Bearer ${creds.api_key}`;
        }

        const response = await fetch(url, {
          method,
          headers,
          body: input.body ? JSON.stringify(input.body) : undefined,
        });

        const responseText = await response.text();
        const truncated = responseText.slice(0, 4000);

        if (!response.ok) {
          return `API Error ${response.status}: ${truncated}`;
        }

        return truncated;
      } catch (err) {
        logger.error("[IntegrationTools] use_service error:", {
          service: input.service_slug,
          error: err instanceof Error ? err.message : err,
        });
        return `Błąd API: ${err instanceof Error ? err.message : "Nieznany błąd"}`;
      }
    },
  },
];
