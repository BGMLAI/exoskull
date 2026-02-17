/**
 * IORS Web Tools
 *
 * Tools for searching the web and fetching web pages.
 * - search_web: Search the internet via Tavily
 * - fetch_webpage: Fetch and extract content from a URL
 */

import type { ToolDefinition } from "./shared";
import { logger } from "@/lib/logger";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

export const webTools: ToolDefinition[] = [
  {
    definition: {
      name: "search_web",
      description:
        'Przeszukaj internet. Użyj gdy user pyta o aktualne informacje, news, dane których nie masz w kontekście. Przykłady: "co nowego w...", "jaka jest cena...", "sprawdź w internecie...".',
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Zapytanie do wyszukania w internecie",
          },
          max_results: {
            type: "number",
            description: "Maksymalna liczba wyników (domyślnie 5)",
          },
        },
        required: ["query"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const query = input.query as string;
      const maxResults = (input.max_results as number) || 5;

      if (!TAVILY_API_KEY) {
        return "Brak klucza TAVILY_API_KEY. Wyszukiwanie internetowe niedostępne.";
      }

      logger.info("[WebTools] search_web:", { query, maxResults });

      try {
        const { tavily } = await import("@tavily/core");
        const client = tavily({ apiKey: TAVILY_API_KEY });

        const response = await client.search(query, {
          maxResults,
          includeAnswer: true,
        });

        let result = "";

        if (response.answer) {
          result += `**Odpowiedź:** ${response.answer}\n\n`;
        }

        result += `**Wyniki wyszukiwania (${response.results.length}):**\n\n`;
        for (const r of response.results) {
          result += `🔗 **${r.title}**\n`;
          result += `   ${r.url}\n`;
          result += `   ${r.content?.slice(0, 300) || ""}${(r.content?.length || 0) > 300 ? "..." : ""}\n\n`;
        }

        return result;
      } catch (error) {
        logger.error("[WebTools] search_web error:", {
          error: error instanceof Error ? error.message : error,
        });
        return "Nie udało się wyszukać w internecie. Spróbuj ponownie.";
      }
    },
  },
  {
    definition: {
      name: "fetch_webpage",
      description:
        'Pobierz i wyciągnij treść ze strony internetowej. Użyj gdy user poda link i chce zobaczyć jego zawartość. Przykłady: "przeczytaj tę stronę: https://...", "co jest pod tym linkiem?".',
      input_schema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "URL strony do pobrania",
          },
          save_to_knowledge: {
            type: "boolean",
            description:
              "Czy zapisać do bazy wiedzy (domyślnie false — tylko wyświetl treść)",
          },
        },
        required: ["url"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const url = input.url as string;
      const saveToKnowledge = input.save_to_knowledge as boolean;

      logger.info("[WebTools] fetch_webpage:", { url, saveToKnowledge });

      try {
        if (saveToKnowledge) {
          const { importUrl } = await import("@/lib/knowledge/url-processor");
          const result = await importUrl(url, tenantId);
          if (result.success) {
            return `Strona zapisana do bazy wiedzy (ID: ${result.documentId}). Treść będzie dostępna przez search_knowledge.`;
          }
          return `Nie udało się zapisać: ${result.error}`;
        }

        // Just fetch and return content
        let content: string;

        if (FIRECRAWL_API_KEY) {
          const FirecrawlApp = (await import("@mendable/firecrawl-js")).default;
          const app = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY });
          const doc = await app.scrape(url, { formats: ["markdown"] });
          content = doc.markdown || "Brak treści";
        } else {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(15000),
          });
          const html = await response.text();
          content = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        }

        // Truncate to avoid context overflow
        const maxChars = 4000;
        if (content.length > maxChars) {
          content = content.slice(0, maxChars) + "\n\n[...treść obcięta]";
        }

        return `Treść strony ${url}:\n\n${content}`;
      } catch (error) {
        logger.error("[WebTools] fetch_webpage error:", {
          error: error instanceof Error ? error.message : error,
        });
        return "Nie udało się pobrać strony. Sprawdź URL i spróbuj ponownie.";
      }
    },
  },
];
