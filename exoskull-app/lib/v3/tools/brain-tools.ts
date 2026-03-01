/**
 * v3 Brain Tools — Tier 1: Knowledge & Search
 *
 * 7 tools: search_brain, remember, log_note, search_web, fetch_url, analyze_image, extract_text_from_image
 */

import type { V3ToolDefinition } from "./index";

// ============================================================================
// #1 search_brain — unified search across ALL memory
// ============================================================================

const searchBrainTool: V3ToolDefinition = {
  definition: {
    name: "search_brain",
    description:
      "Przeszukaj CAŁY mózg — rozmowy, dokumenty, notatki, wiedzę. Użyj ZAWSZE gdy szukasz informacji o użytkowniku lub jego danych.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Zapytanie do przeszukania pamięci",
        },
        date_from: { type: "string", description: "Data od (YYYY-MM-DD)" },
        date_to: { type: "string", description: "Data do (YYYY-MM-DD)" },
      },
      required: ["query"],
    },
  },
  async execute(input, tenantId) {
    const query = input.query as string;

    try {
      // Try brain search first (unified: vector + keyword + entity + highlights)
      const { searchBrain, formatBrainResults } =
        await import("@/lib/memory/brain");
      const results = await searchBrain(tenantId, query, {
        limit: 10,
        dateFrom: input.date_from as string | undefined,
        dateTo: input.date_to as string | undefined,
      });
      return formatBrainResults(results, query);
    } catch {
      // Fallback to unified search
      try {
        const { unifiedSearch } = await import("@/lib/memory/unified-search");
        const results = await unifiedSearch({
          tenantId,
          query,
          limit: 10,
          minScore: 0.05,
        });
        if (results.length === 0) return `Nie znalazłem nic dla: "${query}"`;
        return results
          .map(
            (r, i) =>
              `[${i + 1}] (${r.type || "memory"}, score: ${r.score.toFixed(2)}) ${r.content.slice(0, 500)}`,
          )
          .join("\n\n");
      } catch (err) {
        return `Błąd wyszukiwania: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  },
};

// ============================================================================
// #2 remember — save fact/preference to organism knowledge
// ============================================================================

const rememberTool: V3ToolDefinition = {
  definition: {
    name: "remember",
    description:
      "Zapamiętaj informację o użytkowniku na stałe. Używaj do preferencji, wzorców, faktów.",
    input_schema: {
      type: "object" as const,
      properties: {
        content: { type: "string", description: "Co zapamiętać" },
        category: {
          type: "string",
          enum: ["preference", "pattern", "anti_pattern", "fact"],
          description: "Kategoria: preferencja, wzorzec, anty-wzorzec, fakt",
        },
      },
      required: ["content"],
    },
  },
  async execute(input, tenantId) {
    const content = input.content as string;
    const category = (input.category as string) || "preference";

    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();
      const { error } = await supabase.from("exo_organism_knowledge").insert({
        tenant_id: tenantId,
        category,
        content,
        confidence: 0.8,
        source: "conversation",
      });
      if (error) throw error;

      // Also save to legacy tacit knowledge for backward compat
      try {
        const { remember } = await import("@/lib/memory/brain");
        await remember(tenantId, content, category as "preference" | "pattern");
      } catch {
        /* legacy fallback optional */
      }

      return `Zapamiętano: "${content}" [${category}]`;
    } catch (err) {
      return `Błąd zapisu: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// #3 log_note — quick note with context
// ============================================================================

const logNoteTool: V3ToolDefinition = {
  definition: {
    name: "log_note",
    description: "Szybka notatka z kontekstem i timestampem.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Tytuł notatki" },
        content: { type: "string", description: "Treść notatki" },
        type: {
          type: "string",
          enum: ["thought", "idea", "observation", "todo", "reflection"],
          description: "Typ notatki",
        },
      },
      required: ["content"],
    },
  },
  async execute(input, tenantId) {
    const content = input.content as string;
    const title = (input.title as string) || content.slice(0, 60);
    const type = (input.type as string) || "thought";

    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();
      const { error } = await supabase.from("user_notes").insert({
        tenant_id: tenantId,
        title,
        content,
        type,
        captured_at: new Date().toISOString(),
      });
      if (error) throw error;
      return `Notatka zapisana: "${title}"`;
    } catch (err) {
      return `Błąd: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// #4 search_web — internet search via Tavily
// ============================================================================

const searchWebTool: V3ToolDefinition = {
  definition: {
    name: "search_web",
    description:
      "Przeszukaj internet. Użyj gdy user pyta o aktualne informacje, news, dane.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Zapytanie wyszukiwania" },
        max_results: {
          type: "number",
          description: "Max wyników (domyślnie 5)",
        },
      },
      required: ["query"],
    },
  },
  async execute(input) {
    const query = input.query as string;
    const maxResults = (input.max_results as number) || 5;

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return "Brak klucza Tavily API — web search niedostępny.";

    try {
      const { tavily } = await import("@tavily/core");
      const client = tavily({ apiKey });
      const results = await client.search(query, {
        maxResults,
        includeAnswer: true,
      });

      let output = "";
      if (results.answer) {
        output += `**Odpowiedź:** ${results.answer}\n\n`;
      }
      if (results.results && results.results.length > 0) {
        output += "**Wyniki:**\n";
        for (const r of results.results) {
          output += `- [${r.title}](${r.url})\n  ${r.content?.slice(0, 200) || ""}\n`;
        }
      }
      return output || "Brak wyników.";
    } catch (err) {
      return `Błąd wyszukiwania: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
  timeoutMs: 15_000,
};

// ============================================================================
// #5 fetch_url — import webpage to knowledge base
// ============================================================================

const fetchUrlTool: V3ToolDefinition = {
  definition: {
    name: "fetch_url",
    description:
      "Pobierz treść strony internetowej. Opcjonalnie zapisz do bazy wiedzy.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL strony" },
        save_to_knowledge: {
          type: "boolean",
          description: "Zapisać do bazy wiedzy? (domyślnie false)",
        },
      },
      required: ["url"],
    },
  },
  async execute(input, tenantId) {
    const url = input.url as string;
    const saveToKnowledge = input.save_to_knowledge as boolean;

    if (saveToKnowledge) {
      try {
        const { importUrl } = await import("@/lib/knowledge/url-processor");
        const result = await importUrl(url, tenantId);
        return `Zaimportowano do bazy wiedzy (ID: ${result.documentId}). Przetwarzanie w tle.`;
      } catch (err) {
        return `Błąd importu: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    // Display only — fetch and extract text
    try {
      const firecrawlKey = process.env.FIRECRAWL_API_KEY;
      if (firecrawlKey) {
        const { default: FirecrawlApp } =
          await import("@mendable/firecrawl-js");
        const app = new FirecrawlApp({ apiKey: firecrawlKey });
        const doc = await app.scrape(url, { formats: ["markdown"] });
        const content = (doc as { markdown?: string }).markdown || "";
        return content.slice(0, 4000) || "Brak treści.";
      }

      // Basic fetch fallback
      const response = await fetch(url, {
        headers: { "User-Agent": "ExoSkull/3.0" },
        signal: AbortSignal.timeout(10_000),
      });
      const html = await response.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return text.slice(0, 4000) || "Brak treści.";
    } catch (err) {
      return `Błąd pobierania: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
  timeoutMs: 20_000,
};

// ============================================================================
// #6 analyze_image — vision analysis via Gemini
// ============================================================================

const analyzeImageTool: V3ToolDefinition = {
  definition: {
    name: "analyze_image",
    description:
      "Analizuj obraz: screenshoty, zdjęcia, wykresy, diagramy, OCR. Używa Gemini Vision.",
    input_schema: {
      type: "object" as const,
      properties: {
        image_url: { type: "string", description: "URL obrazu do analizy" },
        prompt: {
          type: "string",
          description: "Co chcesz wiedzieć o tym obrazie?",
        },
      },
      required: ["image_url", "prompt"],
    },
  },
  async execute(input, tenantId) {
    try {
      const { analyzeImage } = await import("@/lib/ai/capabilities/vision");
      const result = await analyzeImage({
        imageUrl: input.image_url as string,
        prompt: input.prompt as string,
        tenantId,
      });
      return `**Analiza obrazu:**\n${result.text}\n\n_Model: ${result.model}, ${result.durationMs}ms_`;
    } catch (err) {
      return `Błąd analizy: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
  timeoutMs: 30_000,
};

// ============================================================================
// #7 extract_text_from_image — OCR via Gemini
// ============================================================================

const extractTextTool: V3ToolDefinition = {
  definition: {
    name: "extract_text_from_image",
    description: "OCR — wyciągnij tekst z obrazu, dokumentu, screenshotu.",
    input_schema: {
      type: "object" as const,
      properties: {
        image_url: { type: "string", description: "URL obrazu" },
      },
      required: ["image_url"],
    },
  },
  async execute(input, tenantId) {
    try {
      const { extractTextFromImage } =
        await import("@/lib/ai/capabilities/vision");
      const text = await extractTextFromImage(
        input.image_url as string,
        tenantId,
      );
      return text || "Nie znaleziono tekstu w obrazie.";
    } catch (err) {
      return `Błąd OCR: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
  timeoutMs: 30_000,
};

// ============================================================================
// EXPORT
// ============================================================================

export const brainTools: V3ToolDefinition[] = [
  searchBrainTool,
  rememberTool,
  logNoteTool,
  searchWebTool,
  fetchUrlTool,
  analyzeImageTool,
  extractTextTool,
];
