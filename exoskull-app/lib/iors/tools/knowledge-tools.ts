/**
 * IORS Knowledge Tools
 *
 * Tools for searching user-uploaded documents via semantic search (pgvector).
 * - search_knowledge: Find relevant document chunks by meaning
 * - import_url: Import a web page into the knowledge base
 */

import type { ToolDefinition } from "./index";
import { searchDocuments } from "@/lib/knowledge/document-processor";
import { importUrl } from "@/lib/knowledge/url-processor";

import { logger } from "@/lib/logger";

export const knowledgeTools: ToolDefinition[] = [
  {
    definition: {
      name: "search_knowledge",
      description:
        'Przeszukaj dokumenty i pliki użytkownika (semantic search). Użyj gdy user pyta o coś co mógł przesłać w pliku, albo gdy potrzebujesz informacji z jego dokumentów. Przykłady: "co było w tym PDF?", "znajdź w moich plikach...", "co pisze w dokumencie o...".',
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description:
              "Zapytanie do wyszukania w dokumentach (po polsku lub angielsku)",
          },
          limit: {
            type: "number",
            description: "Maksymalna liczba wyników (domyślnie 5)",
          },
        },
        required: ["query"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const query = input.query as string;
      const limit = (input.limit as number) || 5;

      logger.info("[KnowledgeTools] search_knowledge:", { query, limit });

      try {
        const results = await searchDocuments(tenantId, query, limit);

        if (results.length === 0) {
          return "Nie znaleziono pasujących dokumentów. Użytkownik może nie mieć przesłanych plików na ten temat.";
        }

        let response = `Znaleziono ${results.length} fragmentów w dokumentach:\n\n`;
        for (const r of results) {
          response += `📄 **${r.filename}** (${r.category}, trafność: ${Math.round(r.similarity * 100)}%)\n`;
          response += `${r.content.slice(0, 500)}${r.content.length > 500 ? "..." : ""}\n\n`;
        }

        return response;
      } catch (searchError) {
        console.error("[KnowledgeTools] search_knowledge error:", searchError);
        return "Nie udało się przeszukać dokumentów. Spróbuj jeszcze raz.";
      }
    },
  },
  {
    definition: {
      name: "import_url",
      description:
        'Zaimportuj stronę internetową do bazy wiedzy użytkownika. Strona zostanie pobrana, przetworzona i będzie dostępna przez search_knowledge. Użyj gdy user chce zapisać artykuł/stronę. Przykłady: "zapisz tę stronę: https://...", "dodaj ten link do mojej wiedzy".',
      input_schema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "URL strony do zaimportowania",
          },
          category: {
            type: "string",
            description:
              "Kategoria dokumentu (np. business, health, personal). Domyślnie: web",
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
      const category = (input.category as string) || "web";

      logger.info("[KnowledgeTools] import_url:", { url, category });

      try {
        const result = await importUrl(url, tenantId, category);

        if (result.success) {
          return `Strona zaimportowana pomyślnie (ID: ${result.documentId}). Treść jest teraz dostępna przez search_knowledge.`;
        }

        return `Nie udało się zaimportować strony: ${result.error}`;
      } catch (error) {
        console.error("[KnowledgeTools] import_url error:", error);
        return "Nie udało się zaimportować strony. Sprawdź URL i spróbuj ponownie.";
      }
    },
  },
];
