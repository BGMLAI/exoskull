/**
 * IORS Knowledge Tools
 *
 * Tools for searching user-uploaded documents via semantic search (pgvector).
 * - search_knowledge: Find relevant document chunks by meaning
 * - list_documents: Show uploaded files and their status
 * - get_document_content: Read full extracted text of a document
 * - import_url: Import a web page into the knowledge base
 */

import type { ToolDefinition } from "./index";
import { searchDocuments } from "@/lib/knowledge/document-processor";
import { importUrl } from "@/lib/knowledge/url-processor";
import { getServiceSupabase } from "@/lib/supabase/service";

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
  {
    definition: {
      name: "list_documents",
      description:
        'Pokaż listę przesłanych plików użytkownika z ich statusem przetwarzania. Użyj ZAWSZE gdy user pyta o swoje pliki, albo gdy search_knowledge zwraca 0 wyników. Przykłady: "jakie mam pliki?", "co przesłałem?", "pokaż moje dokumenty".',
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    execute: async (
      _input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      logger.info("[KnowledgeTools] list_documents:", { tenantId });

      try {
        const supabase = getServiceSupabase();
        const { data, error } = await supabase
          .from("exo_user_documents")
          .select(
            "id, original_name, status, category, created_at, summary, file_size",
          )
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(20);

        if (error) {
          console.error("[KnowledgeTools] list_documents error:", error);
          return "Nie udało się pobrać listy dokumentów.";
        }

        if (!data || data.length === 0) {
          return "Użytkownik nie przesłał żadnych plików. Może przesłać pliki przez ikonę spinacza w czacie.";
        }

        let response = `Pliki użytkownika (${data.length}):\n\n`;
        for (const doc of data) {
          const size = doc.file_size
            ? `${Math.round(doc.file_size / 1024)}KB`
            : "";
          response += `📄 **${doc.original_name}** | status: ${doc.status} | ${doc.category || "general"} | ${size}\n`;
          if (doc.summary) {
            response += `   Podsumowanie: ${doc.summary.slice(0, 200)}${doc.summary.length > 200 ? "..." : ""}\n`;
          }
          response += "\n";
        }

        const readyCount = data.filter((d) => d.status === "ready").length;
        const failedCount = data.filter((d) => d.status === "failed").length;
        if (failedCount > 0) {
          response += `⚠️ ${failedCount} plików nie zostało przetworzonych (status: failed).\n`;
        }
        if (readyCount === 0 && data.length > 0) {
          response += `⚠️ Żaden plik nie ma statusu "ready" — przetwarzanie mogło się nie udać.\n`;
        }

        return response;
      } catch (err) {
        console.error("[KnowledgeTools] list_documents error:", err);
        return "Nie udało się pobrać listy dokumentów.";
      }
    },
  },
  {
    definition: {
      name: "get_document_content",
      description:
        'Pobierz pełną treść konkretnego dokumentu po nazwie. Użyj gdy znasz nazwę pliku i chcesz zobaczyć co zawiera. Szybsze niż search_knowledge dla konkretnych plików. Przykłady: "pokaż co jest w produkty.xlsx", "przeczytaj ten plik".',
      input_schema: {
        type: "object" as const,
        properties: {
          document_name: {
            type: "string",
            description:
              "Nazwa pliku lub jej fragment (np. 'produkty' znajdzie 'produkty_KOMPLETNE.xlsx')",
          },
        },
        required: ["document_name"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const docName = input.document_name as string;
      logger.info("[KnowledgeTools] get_document_content:", {
        docName,
        tenantId,
      });

      try {
        const supabase = getServiceSupabase();
        const { data, error } = await supabase
          .from("exo_user_documents")
          .select("original_name, extracted_text, summary, status")
          .eq("tenant_id", tenantId)
          .ilike("original_name", `%${docName}%`)
          .limit(1)
          .single();

        if (error || !data) {
          return `Nie znalazłem dokumentu zawierającego "${docName}" w nazwie. Użyj list_documents żeby zobaczyć dostępne pliki.`;
        }

        if (data.status !== "ready") {
          return `Dokument "${data.original_name}" ma status: ${data.status}. Przetwarzanie mogło się nie udać — plik nie jest jeszcze gotowy do odczytu.`;
        }

        const text = data.extracted_text || "";
        if (!text) {
          return `Dokument "${data.original_name}" jest oznaczony jako ready, ale nie ma wyekstrahowanego tekstu. Plik może być pusty lub w nieobsługiwanym formacie.`;
        }

        const truncated = text.length > 4000;
        return `📄 **${data.original_name}**\n${data.summary ? `Podsumowanie: ${data.summary}\n` : ""}\n---\n${text.slice(0, 4000)}${truncated ? `\n\n...(obcięte — pełna treść: ${text.length} znaków)` : ""}`;
      } catch (err) {
        console.error("[KnowledgeTools] get_document_content error:", err);
        return "Nie udało się pobrać treści dokumentu.";
      }
    },
  },
];
