/**
 * v3 Knowledge Tools — Phase 2
 *
 * 4 tools: import_document, import_url, list_knowledge, get_document
 */

import type { V3ToolDefinition } from "./index";

// ============================================================================
// #1 import_url — fetch URL and save to knowledge base
// ============================================================================

const importUrlTool: V3ToolDefinition = {
  definition: {
    name: "import_url",
    description:
      "Pobierz treść z URL i zapisz w bazie wiedzy. Użyj gdy user podaje link lub gdy potrzebujesz informacji z internetu na stałe.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL do pobrania" },
        title: { type: "string", description: "Opcjonalny tytuł dokumentu" },
        save: {
          type: "boolean",
          description:
            "Czy zapisać do knowledge base (true) czy tylko pokazać treść (false). Default: true",
        },
      },
      required: ["url"],
    },
  },
  timeoutMs: 30_000,
  async execute(input, tenantId) {
    const url = input.url as string;
    const save = input.save !== false;

    try {
      if (save) {
        const { importUrl } = await import("@/lib/knowledge/url-processor");
        const result = await importUrl(
          tenantId,
          url,
          input.title as string | undefined,
        );
        return `Zaimportowano "${url}" (zaimportowano). ID: ${result.documentId}`;
      }

      // Just fetch and return content
      const firecrawlKey = process.env.FIRECRAWL_API_KEY;
      if (firecrawlKey) {
        const { default: FirecrawlApp } =
          await import("@mendable/firecrawl-js");
        const app = new FirecrawlApp({ apiKey: firecrawlKey });
        const doc = await app.scrape(url, { formats: ["markdown"] });
        return (
          ((doc as { markdown?: string }).markdown || "").slice(0, 8000) ||
          "Brak treści."
        );
      }

      const response = await fetch(url, {
        headers: { "User-Agent": "ExoSkull/3.0" },
        signal: AbortSignal.timeout(10_000),
      });
      const text = await response.text();
      return text.slice(0, 8000);
    } catch (err) {
      return `Błąd importu URL: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// #2 list_knowledge — list user's documents
// ============================================================================

const listKnowledgeTool: V3ToolDefinition = {
  definition: {
    name: "list_knowledge",
    description:
      "Pokaż listę dokumentów w bazie wiedzy użytkownika. Użyj gdy user pyta co wie system.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          description: "Filtruj po kategorii: document, url, note, upload",
        },
        limit: { type: "number", description: "Ile wyników (default: 20)" },
      },
      required: [],
    },
  },
  async execute(input, tenantId) {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      let query = supabase
        .from("exo_user_documents")
        .select("id, original_name, category, file_type, created_at, metadata")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit((input.limit as number) || 20);

      if (input.category) {
        query = query.eq("category", input.category as string);
      }

      const { data, error } = await query;
      if (error) return `Błąd: ${error.message}`;
      if (!data?.length) return "Brak dokumentów w bazie wiedzy.";

      return data
        .map(
          (
            d: {
              original_name: string;
              category: string | null;
              file_type: string | null;
              created_at: string;
            },
            i: number,
          ) =>
            `[${i + 1}] ${d.original_name} (${d.category || d.file_type || "?"}) — ${new Date(d.created_at).toLocaleDateString("pl")}`,
        )
        .join("\n");
    } catch (err) {
      return `Błąd: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// #3 get_document — read a specific document's content
// ============================================================================

const getDocumentTool: V3ToolDefinition = {
  definition: {
    name: "get_document",
    description:
      "Przeczytaj treść konkretnego dokumentu z bazy wiedzy. Podaj ID lub nazwę.",
    input_schema: {
      type: "object" as const,
      properties: {
        document_id: { type: "string", description: "UUID dokumentu" },
        name: {
          type: "string",
          description: "Nazwa dokumentu (jeśli nie znasz ID)",
        },
        page: {
          type: "number",
          description: "Strona (1-based), 16KB per page. Default: 1",
        },
      },
      required: [],
    },
  },
  async execute(input, tenantId) {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      let docId = input.document_id as string | undefined;

      // Find by name if no ID
      if (!docId && input.name) {
        const { data } = await supabase
          .from("exo_user_documents")
          .select("id")
          .eq("tenant_id", tenantId)
          .ilike("original_name", `%${input.name}%`)
          .limit(1)
          .single();
        docId = data?.id;
      }

      if (!docId)
        return "Nie znaleziono dokumentu. Użyj list_knowledge żeby zobaczyć dostępne.";

      const { data, error } = await supabase
        .from("exo_user_documents")
        .select("original_name, extracted_text, category")
        .eq("id", docId)
        .eq("tenant_id", tenantId)
        .single();

      if (error || !data) return "Nie znaleziono dokumentu.";

      const text = data.extracted_text || "";
      const pageSize = 16_000;
      const page = Math.max(1, (input.page as number) || 1);
      const start = (page - 1) * pageSize;
      const totalPages = Math.ceil(text.length / pageSize);
      const slice = text.slice(start, start + pageSize);

      return `📄 ${data.original_name} (strona ${page}/${totalPages})\n\n${slice}`;
    } catch (err) {
      return `Błąd: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// #4 learn_pattern — store a learned pattern (sweet/sour)
// ============================================================================

const learnPatternTool: V3ToolDefinition = {
  definition: {
    name: "learn_pattern",
    description:
      "Zapisz wzorzec do pamięci organizmu. Użyj 'sweet' dla tego co działa, 'sour' dla anty-wzorców. System uczy się z każdej interakcji.",
    input_schema: {
      type: "object" as const,
      properties: {
        content: { type: "string", description: "Co się nauczyłem" },
        category: {
          type: "string",
          enum: ["pattern", "preference", "anti_pattern", "fact"],
          description: "Typ wzorca",
        },
        confidence: {
          type: "number",
          description: "Pewność 0.0-1.0. Sweet patterns → 0.7+, sour → 0.3-0.5",
        },
        source: {
          type: "string",
          description: "Skąd wiem (conversation, observation, feedback)",
        },
      },
      required: ["content", "category"],
    },
  },
  async execute(input, tenantId) {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      const { error } = await supabase.from("exo_organism_knowledge").insert({
        tenant_id: tenantId,
        content: input.content as string,
        category: input.category as string,
        confidence: (input.confidence as number) || 0.5,
        source: (input.source as string) || "conversation",
      });

      if (error) return `Błąd zapisu: ${error.message}`;

      const emoji = input.category === "anti_pattern" ? "🍋" : "🍯";
      return `${emoji} Zapisano ${input.category}: "${(input.content as string).slice(0, 100)}"`;
    } catch (err) {
      return `Błąd: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// EXPORT
// ============================================================================

export const knowledgeTools: V3ToolDefinition[] = [
  importUrlTool,
  listKnowledgeTool,
  getDocumentTool,
  learnPatternTool,
];
