/**
 * v3 Brain Tools — Tier 1: Knowledge & Search
 *
 * 7 tools: search_brain, remember, log_note, search_web, fetch_url, analyze_image, extract_text_from_image
 */

import { type V3ToolDefinition, errMsg } from "./index";

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
        return `Błąd wyszukiwania: ${errMsg(err)}`;
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
      return `Błąd zapisu: ${errMsg(err)}`;
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
      return `Błąd: ${errMsg(err)}`;
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
      return `Błąd wyszukiwania: ${errMsg(err)}`;
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
        return `Błąd importu: ${errMsg(err)}`;
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
      return `Błąd pobierania: ${errMsg(err)}`;
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
      return `Błąd analizy: ${errMsg(err)}`;
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
      return `Błąd OCR: ${errMsg(err)}`;
    }
  },
  timeoutMs: 30_000,
};

// ============================================================================
// #8 get_daily_summary — summarize today's activity
// ============================================================================

const getDailySummaryTool: V3ToolDefinition = {
  definition: {
    name: "get_daily_summary",
    description:
      "Podsumuj dzisiejszy dzień użytkownika: rozmowy, zadania, cele, aktywność. Użyj gdy user pyta co robił dziś.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: {
          type: "string",
          description: "Data do podsumowania (YYYY-MM-DD). Domyślnie: dziś.",
        },
      },
      required: [],
    },
  },
  async execute(input, tenantId) {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      const dateStr =
        (input.date as string) || new Date().toISOString().slice(0, 10);
      const dayStart = `${dateStr}T00:00:00Z`;
      const dayEnd = `${dateStr}T23:59:59Z`;

      // Parallel queries for today's activity
      const [messagesRes, tasksRes, goalsRes, autonomyRes] = await Promise.all([
        supabase
          .from("exo_unified_messages")
          .select("content, role, channel, created_at")
          .eq("tenant_id", tenantId)
          .gte("created_at", dayStart)
          .lte("created_at", dayEnd)
          .order("created_at", { ascending: true })
          .limit(50),
        supabase
          .from("user_ops")
          .select("title, status, priority, updated_at")
          .eq("tenant_id", tenantId)
          .gte("updated_at", dayStart)
          .lte("updated_at", dayEnd)
          .limit(20),
        supabase
          .from("user_loops")
          .select("name, priority, aspects, updated_at")
          .eq("tenant_id", tenantId)
          .gte("updated_at", dayStart)
          .lte("updated_at", dayEnd)
          .limit(10),
        supabase
          .from("exo_autonomy_log")
          .select("event_type, payload, created_at")
          .eq("tenant_id", tenantId)
          .gte("created_at", dayStart)
          .lte("created_at", dayEnd)
          .limit(20),
      ]);

      const msgs = messagesRes.data || [];
      const tasks = tasksRes.data || [];
      const goals = goalsRes.data || [];
      const autonomy = autonomyRes.data || [];

      let summary = `📊 **Podsumowanie dnia ${dateStr}:**\n\n`;

      // Messages
      const userMsgs = msgs.filter((m: { role: string }) => m.role === "user");
      const assistantMsgs = msgs.filter(
        (m: { role: string }) => m.role === "assistant",
      );
      summary += `💬 **Rozmowy:** ${userMsgs.length} wiadomości (${assistantMsgs.length} odpowiedzi)\n`;
      if (userMsgs.length > 0) {
        const topics = userMsgs
          .slice(0, 5)
          .map(
            (m: { content: string }) =>
              `  - ${(m.content || "").slice(0, 80)}...`,
          )
          .join("\n");
        summary += `Tematy:\n${topics}\n\n`;
      }

      // Tasks
      if (tasks.length > 0) {
        const completed = tasks.filter(
          (t: { status: string }) => t.status === "completed",
        );
        const active = tasks.filter(
          (t: { status: string }) =>
            t.status === "active" || t.status === "pending",
        );
        summary += `✅ **Zadania:** ${completed.length} ukończonych, ${active.length} aktywnych\n`;
        for (const t of tasks.slice(0, 5)) {
          const icon =
            (t as { status: string }).status === "completed" ? "✅" : "⏳";
          summary += `  ${icon} ${(t as { title: string }).title}\n`;
        }
        summary += "\n";
      } else {
        summary += "✅ **Zadania:** brak aktywności\n\n";
      }

      // Goals
      if (goals.length > 0) {
        summary += `🎯 **Cele (zaktualizowane):** ${goals.length}\n`;
        for (const g of goals) {
          const asp =
            ((g as { aspects: unknown }).aspects as Record<string, unknown>) ||
            {};
          summary += `  - ${(g as { name: string }).name} (${(asp.progress as number) || 0}%)\n`;
        }
        summary += "\n";
      }

      // Autonomy
      if (autonomy.length > 0) {
        summary += `🤖 **Autonomiczne akcje:** ${autonomy.length}\n`;
        for (const a of autonomy.slice(0, 5)) {
          const payload =
            (a as { payload: Record<string, unknown> }).payload || {};
          summary += `  - ${(a as { event_type: string }).event_type}: ${((payload.description as string) || "").slice(0, 60)}\n`;
        }
      }

      if (msgs.length === 0 && tasks.length === 0 && goals.length === 0) {
        summary += "Brak aktywności w tym dniu.";
      }

      return summary;
    } catch (err) {
      return `Błąd: ${errMsg(err)}`;
    }
  },
};

// ============================================================================
// #9 correct_daily_summary — correct/annotate today's summary
// ============================================================================

const correctDailySummaryTool: V3ToolDefinition = {
  definition: {
    name: "correct_daily_summary",
    description:
      "Popraw lub uzupełnij podsumowanie dnia. User mówi co pominięto lub co było inaczej.",
    input_schema: {
      type: "object" as const,
      properties: {
        correction: {
          type: "string",
          description: "Co poprawić/dodać do podsumowania",
        },
        date: {
          type: "string",
          description: "Data podsumowania (YYYY-MM-DD). Domyślnie: dziś.",
        },
      },
      required: ["correction"],
    },
  },
  async execute(input, tenantId) {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      const dateStr =
        (input.date as string) || new Date().toISOString().slice(0, 10);

      const { error } = await supabase.from("user_notes").insert({
        tenant_id: tenantId,
        title: `Korekta podsumowania: ${dateStr}`,
        content: input.correction as string,
        type: "reflection",
        captured_at: new Date().toISOString(),
        metadata: { type: "daily_correction", date: dateStr },
      });

      if (error) throw error;
      return `📝 Korekta zapisana dla ${dateStr}: "${(input.correction as string).slice(0, 100)}"`;
    } catch (err) {
      return `Błąd: ${errMsg(err)}`;
    }
  },
};

// ============================================================================
// #10 analyze_emotional_state — detect emotional state from text
// ============================================================================

const analyzeEmotionalStateTool: V3ToolDefinition = {
  definition: {
    name: "analyze_emotional_state",
    description:
      "Analizuj stan emocjonalny użytkownika na podstawie jego wiadomości. Użyj gdy user wyraża emocje, stres, frustrację, radość. Dostosuj ton odpowiedzi.",
    input_schema: {
      type: "object" as const,
      properties: {
        text: {
          type: "string",
          description:
            "Tekst do analizy (ostatnia wiadomość lub kontekst rozmowy)",
        },
        context: {
          type: "string",
          description: "Dodatkowy kontekst (np. co user robił, o czym mówił)",
        },
      },
      required: ["text"],
    },
  },
  async execute(input, tenantId) {
    const text = input.text as string;

    // Keyword-based emotion detection (fast, no API call needed)
    const emotionPatterns: Record<string, string[]> = {
      stressed: [
        "stres",
        "deadline",
        "przytłacz",
        "nie dam rady",
        "za dużo",
        "presja",
        "panika",
        "niepokój",
      ],
      frustrated: [
        "frustr",
        "wkurz",
        "irytuj",
        "nie działa",
        "znowu",
        "kurwa",
        "cholera",
        "dość",
      ],
      sad: [
        "smutny",
        "smutno",
        "przygnębion",
        "samotny",
        "tęskn",
        "płacz",
        "źle się czuję",
      ],
      happy: [
        "super",
        "świetnie",
        "udało",
        "radość",
        "szczęśliw",
        "zajebiście",
        "bomba",
        "rewelacja",
      ],
      motivated: [
        "motywacja",
        "zmotywow",
        "chcę",
        "zrobię",
        "dam radę",
        "energia",
        "gotowy",
      ],
      tired: [
        "zmęcz",
        "wyczerpan",
        "nie mam siły",
        "sen",
        "brak energii",
        "padnięty",
      ],
      anxious: [
        "lęk",
        "boję się",
        "martwię",
        "niepewn",
        "obawa",
        "strach",
        "nerwow",
      ],
    };

    const lower = text.toLowerCase();
    const detected: { emotion: string; confidence: number }[] = [];

    for (const [emotion, patterns] of Object.entries(emotionPatterns)) {
      const matches = patterns.filter((p) => lower.includes(p));
      if (matches.length > 0) {
        detected.push({
          emotion,
          confidence: Math.min(0.5 + matches.length * 0.15, 0.95),
        });
      }
    }

    // Sort by confidence
    detected.sort((a, b) => b.confidence - a.confidence);

    // Store emotional state for adaptation
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      await supabase.from("exo_organism_knowledge").insert({
        tenant_id: tenantId,
        category: "pattern",
        content: `Stan emocjonalny: ${detected.length > 0 ? detected.map((d) => `${d.emotion}(${(d.confidence * 100).toFixed(0)}%)`).join(", ") : "neutralny"}. Kontekst: "${text.slice(0, 200)}"`,
        confidence: detected.length > 0 ? detected[0].confidence : 0.5,
        source: "emotional_analysis",
      });
    } catch {
      /* non-critical */
    }

    if (detected.length === 0) {
      return JSON.stringify({
        primary_emotion: "neutral",
        confidence: 0.6,
        recommendation: "Stan neutralny — odpowiadaj normalnie, merytorycznie.",
        detected_emotions: [],
      });
    }

    const primary = detected[0];
    const recommendations: Record<string, string> = {
      stressed:
        "Bądź spokojny i konkretny. Zaproponuj priorytety. Nie dodawaj nowych zadań.",
      frustrated:
        "Okaż zrozumienie. Zaproponuj rozwiązanie problemu. Nie moralizuj.",
      sad: "Bądź empatyczny i ciepły. Zaproponuj małe, osiągalne kroki.",
      happy:
        "Dopasuj energię! Wzmocnij pozytywne emocje. Zaproponuj ambitne cele.",
      motivated: "Wykorzystaj motywację! Zaproponuj konkretne działania TERAZ.",
      tired: "Zaproponuj odpoczynek. Odrocz zadania. Pokaż że mniej = OK.",
      anxious:
        "Uspokój i normalizuj. Podaj fakty. Zaproponuj plan krok po kroku.",
    };

    return JSON.stringify({
      primary_emotion: primary.emotion,
      confidence: primary.confidence,
      recommendation:
        recommendations[primary.emotion] || "Dostosuj ton do emocji.",
      detected_emotions: detected.map((d) => ({
        emotion: d.emotion,
        confidence: d.confidence,
      })),
      context: (input.context as string) || null,
    });
  },
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
  getDailySummaryTool,
  correctDailySummaryTool,
  analyzeEmotionalStateTool,
];
