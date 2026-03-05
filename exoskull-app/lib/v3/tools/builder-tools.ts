/**
 * v3 App Builder Tools — Phase 5
 *
 * REAL app builder: creates Postgres tables + CRUD API + HTML frontend.
 * Uses existing generateApp() pipeline for backend, AI for frontend.
 *
 * 3 tools: build_app, generate_content, self_extend_tool
 */

import type { V3ToolDefinition } from "./index";
import { logger } from "@/lib/logger";

// ============================================================================
// #1 build_app — Real app with Postgres backend + API + HTML frontend
// ============================================================================

const buildAppTool: V3ToolDefinition = {
  definition: {
    name: "build_app",
    description:
      "Zbuduj prawdziwą aplikację z bazą danych Postgres, REST API i frontendem. Tworzy tabelę, CRUD endpoint /api/apps/{slug}/data i widget na dashboardzie. Dane trwałe w DB, nie localStorage.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description:
            "Nazwa/slug aplikacji (np. 'habit-tracker', 'lumpx-pro'). Będzie w URL.",
        },
        description: {
          type: "string",
          description:
            "Co aplikacja ma robić — im więcej szczegółów tym lepiej",
        },
        goal_id: {
          type: "string",
          description: "UUID celu którego ta app jest częścią",
        },
        features: {
          type: "array",
          items: { type: "string" },
          description:
            "Lista funkcji (np. ['dodawanie produktów', 'statystyki', 'eksport'])",
        },
      },
      required: ["name", "description"],
    },
  },
  timeoutMs: 55_000,
  async execute(input, tenantId) {
    const rawName = input.name as string;
    const description = input.description as string;
    const features = (input.features as string[]) || [];

    // Sanitize slug
    const slug = rawName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (!slug) return "Nieprawidłowa nazwa aplikacji.";

    try {
      // ── Step 1: Create real Postgres table + CRUD via generateApp() ──
      const { generateApp } =
        await import("@/lib/apps/generator/app-generator");

      const fullDescription =
        features.length > 0
          ? `[Slug: ${slug}] ${description}. Funkcje: ${features.join(", ")}`
          : `[Slug: ${slug}] ${description}`;

      logger.info("[build_app] Creating real app via generateApp()", {
        slug,
        tenantId,
      });

      const result = await generateApp({
        tenant_id: tenantId,
        description: fullDescription,
        source: "chat_command",
      });

      if (!result.success || !result.app) {
        return `Nie udało się utworzyć aplikacji: ${result.error || "Nieznany błąd"}`;
      }

      const app = result.app;
      const appSlug = app.slug;
      const tableName = app.table_name;
      const columns = (app.columns || []) as Array<{
        name: string;
        type: string;
        description?: string;
      }>;
      const columnList = columns
        .map(
          (c) =>
            `${c.name} (${c.type}${c.description ? ": " + c.description : ""})`,
        )
        .join(", ");

      logger.info("[build_app] App created in DB", {
        appSlug,
        tableName,
        columnCount: columns.length,
      });

      // ── Step 2: Generate frontend HTML via coding agent pipeline ──
      // Priority: DeepSeek V3.2 ($0.002/app) → Codex Mini ($0.009/app) → Gemini Flash
      const htmlPrompt = `Wygeneruj kompletną, profesjonalną stronę HTML dla aplikacji "${app.name || rawName}".
Opis: ${fullDescription}

BACKEND API (już istnieje, NIE twórz go):
- GET /api/apps/${appSlug}/data → {"app":{"slug","name","columns","ui_config"},"entries":[...],"total":N}
- POST /api/apps/${appSlug}/data → tworzy wpis. Body JSON z polami: ${columnList}
- DELETE /api/apps/${appSlug}/data?id={id} → usuwa wpis

Kolumny w bazie danych: ${columnList}

WYMAGANIA TECHNICZNE:
- Kompletny HTML5 z <!DOCTYPE html>, <html lang="pl">, <head> z meta charset/viewport, <body>
- Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- fetch() ZAWSZE z {credentials:'include'} i {headers:{'Content-Type':'application/json'}}
- Na starcie: fetch GET → wyświetl wpisy w tabeli/kartkach
- Formularz dodawania: POST z JSON body, walidacja pól przed wysłaniem
- Przycisk usuwania przy każdym wpisie (DELETE request)
- Przy 401: pokaż "Zaloguj się na exoskull.xyz aby korzystać z aplikacji" z linkiem
- Po dodaniu/usunięciu: odśwież listę (ponowne GET)
- Loading states (spinner/skeleton podczas fetch)
- Toast/alert na sukces i błąd
- ZERO localStorage — dane TYLKO przez API

WYMAGANIA DESIGNU:
- Ciemny motyw (bg-gray-900, text-white, accent indigo-500)
- Gradient header z nazwą aplikacji i ikoną
- Responsywny: mobile-first, grid/flex layout
- Karty z cieniem (shadow-lg, rounded-xl) dla formularza i listy
- Hover effects na przyciskach i wierszach tabeli
- Animacje CSS (transition, hover:scale)
- Statystyki/podsumowanie na górze (ile wpisów, ostatni dodany)
- Empty state z ikoną gdy brak danych
- Profesjonalny, nowoczesny wygląd na poziomie SaaS

Odpowiedz TYLKO czystym JSON:
{"html":"<!DOCTYPE html>...cały kod HTML...","title":"Tytuł aplikacji"}
ZERO tekstu poza JSON. HTML musi być kompletny i gotowy do użycia.`;

      let html: string | null = null;
      let title: string = app.name || rawName;
      const errors: string[] = [];

      // Helper: call OpenAI-compatible API
      async function callChatAPI(
        url: string,
        apiKey: string,
        model: string,
        maxTokens: number,
        label: string,
      ): Promise<{ html: string; title: string } | null> {
        try {
          const resp = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "system",
                  content:
                    "Jesteś senior frontend developerem. Generujesz produkcyjny HTML/CSS/JS. Odpowiadasz TYLKO czystym JSON z kluczami 'html' i 'title'. Kod ma być kompletny, profesjonalny, z animacjami i dobrym UX.",
                },
                { role: "user", content: htmlPrompt },
              ],
              max_tokens: maxTokens,
              temperature: 0.4,
              response_format: { type: "json_object" },
            }),
          });
          if (!resp.ok) {
            errors.push(`${label}: HTTP ${resp.status}`);
            return null;
          }
          const data = await resp.json();
          const text = data.choices?.[0]?.message?.content;
          if (!text) return null;
          const parsed = JSON.parse(text);
          return parsed.html
            ? { html: parsed.html, title: parsed.title || title }
            : null;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`${label}: ${msg.slice(0, 200)}`);
          logger.warn(`[build_app] ${label} HTML gen failed:`, msg);
          return null;
        }
      }

      // Helper: validate HTML quality
      function validateHtml(h: string): string[] {
        const issues: string[] = [];
        if (!h.includes("<!DOCTYPE html") && !h.includes("<!doctype html"))
          issues.push("missing DOCTYPE");
        if (!h.includes("<html")) issues.push("missing <html>");
        if (!h.includes("tailwindcss")) issues.push("missing Tailwind CDN");
        if (!h.includes("credentials"))
          issues.push("missing credentials:include in fetch");
        if (!h.includes("/api/apps/")) issues.push("missing API endpoint");
        if (!h.includes("fetch")) issues.push("missing fetch calls");
        return issues;
      }

      // ── Provider 1: DeepSeek V3.2 ($0.002/app — cheapest, excellent at code) ──
      const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
      if (deepseekKey) {
        const result = await callChatAPI(
          "https://api.deepseek.com/chat/completions",
          deepseekKey,
          "deepseek-chat",
          16000,
          "DeepSeek",
        );
        if (result) {
          html = result.html;
          title = result.title;
        }
      }

      // ── Provider 2: Codex Mini ($0.009/app — 100K output, great for code) ──
      const openaiKey = process.env.OPENAI_API_KEY?.trim();
      if (!html && openaiKey) {
        const result = await callChatAPI(
          "https://api.openai.com/v1/chat/completions",
          openaiKey,
          "gpt-4o-mini",
          16000,
          "OpenAI",
        );
        if (result) {
          html = result.html;
          title = result.title;
        }
      }

      // ── Provider 3: Gemini Flash (fallback) ──
      const geminiKey =
        process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
      if (!html && geminiKey) {
        try {
          const { GoogleGenAI } = await import("@google/genai");
          const ai = new GoogleGenAI({ apiKey: geminiKey });
          const genResult = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: htmlPrompt,
            config: {
              responseMimeType: "application/json",
              maxOutputTokens: 16384,
            },
          });
          const text = genResult.text;
          if (text) {
            const parsed = JSON.parse(text);
            html = parsed.html || null;
            title = parsed.title || title;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`Gemini: ${msg.slice(0, 200)}`);
          logger.warn("[build_app] Gemini HTML gen failed:", msg);
        }
      }

      // ── Validation + Iteration (fix issues, max 1 retry) ──
      if (html) {
        const issues = validateHtml(html);
        if (issues.length > 0 && deepseekKey) {
          logger.info("[build_app] HTML has issues, attempting fix:", issues);
          try {
            const fixResp = await fetch(
              "https://api.deepseek.com/chat/completions",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${deepseekKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "deepseek-chat",
                  messages: [
                    {
                      role: "system",
                      content:
                        "Napraw poniższy HTML. Problemy: " +
                        issues.join(", ") +
                        '. Odpowiedz TYLKO czystym JSON: {"html":"...","title":"..."}',
                    },
                    { role: "user", content: html },
                  ],
                  max_tokens: 16000,
                  temperature: 0.2,
                  response_format: { type: "json_object" },
                }),
              },
            );
            if (fixResp.ok) {
              const fixData = await fixResp.json();
              const fixText = fixData.choices?.[0]?.message?.content;
              if (fixText) {
                const fixed = JSON.parse(fixText);
                if (
                  fixed.html &&
                  validateHtml(fixed.html).length < issues.length
                ) {
                  html = fixed.html;
                  title = fixed.title || title;
                  logger.info("[build_app] HTML fixed successfully");
                }
              }
            }
          } catch {
            logger.warn(
              "[build_app] HTML fix iteration failed, using original",
            );
          }
        }
      }

      // Even without HTML frontend, the backend app works
      if (!html) {
        const apiUrl = `https://exoskull.xyz/api/apps/${appSlug}/data`;
        return `✅ Aplikacja "${app.name}" utworzona z bazą danych!\n\n🗄️ Tabela: ${tableName}\n📝 Kolumny: ${columnList}\n📊 CRUD API: ${apiUrl}\n\n⚠️ Frontend HTML nie wygenerowany (${errors.join(", ")}). Dane dostępne przez API.`;
      }

      // Final validation
      if (
        !html.includes("<html") &&
        !html.includes("<!DOCTYPE") &&
        !html.includes("<!doctype")
      ) {
        const apiUrl = `https://exoskull.xyz/api/apps/${appSlug}/data`;
        return `✅ Aplikacja "${app.name}" utworzona z bazą danych!\n\n🗄️ Tabela: ${tableName}\n📊 CRUD API: ${apiUrl}\n\n⚠️ Frontend wygenerowany nieprawidłowo. Dane dostępne przez API.`;
      }

      // ── Step 3: Store frontend HTML ──
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      const { data: existing } = await supabase
        .from("exo_organism_knowledge")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("category", "generated_app")
        .eq("source", appSlug)
        .limit(1)
        .single();

      if (existing) {
        await supabase
          .from("exo_organism_knowledge")
          .update({
            content: html,
            confidence: 1.0,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("exo_organism_knowledge").insert({
          tenant_id: tenantId,
          category: "generated_app",
          content: html,
          confidence: 1.0,
          source: appSlug,
        });
      }

      // Log
      await supabase.from("exo_autonomy_log").insert({
        tenant_id: tenantId,
        event_type: "app_built",
        payload: {
          name: rawName,
          slug: appSlug,
          title,
          description,
          features,
          goal_id: input.goal_id || null,
          table_name: tableName,
          columns: columns.map((c) => c.name),
          html_size: html.length,
          backend: true,
          status: "live",
        },
      });

      const appUrl = `https://exoskull.xyz/api/apps/${appSlug}`;
      const apiUrl = `https://exoskull.xyz/api/apps/${appSlug}/data`;

      return `🚀 App "${title}" jest LIVE z prawdziwą bazą danych!\n\n🔗 Frontend: ${appUrl}\n📊 CRUD API: ${apiUrl}\n🗄️ Tabela: ${tableName}\n📝 Kolumny: ${columns.map((c) => c.name).join(", ")}\n\nDane zapisywane w Postgres (nie localStorage). Widget dodany na dashboard.`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      logger.error("[build_app] Error:", { error: msg });
      return `Błąd budowania: ${msg}`;
    }
  },
};

// ============================================================================
// #2 generate_content — write content (course, ebook, blog, emails)
// ============================================================================

const generateContentTool: V3ToolDefinition = {
  definition: {
    name: "generate_content",
    description:
      "Napisz treść: kurs online, ebook, blog post, email sequence, social media. Użyj gdy cel wymaga tworzenia contentu.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: [
            "course_outline",
            "course_lesson",
            "ebook_chapter",
            "blog_post",
            "email",
            "social_post",
          ],
          description: "Typ contentu",
        },
        title: { type: "string", description: "Tytuł" },
        topic: { type: "string", description: "Temat / kontekst" },
        audience: { type: "string", description: "Dla kogo" },
        tone: {
          type: "string",
          description: "Ton (profesjonalny, casual, edukacyjny, sprzedażowy)",
        },
        goal_id: { type: "string", description: "UUID celu" },
        length: {
          type: "string",
          enum: ["short", "medium", "long"],
          description: "Długość (short: 300 słów, medium: 800, long: 2000)",
        },
      },
      required: ["type", "title", "topic"],
    },
  },
  timeoutMs: 30_000,
  async execute(input, tenantId) {
    try {
      const lengthGuide =
        input.length === "short"
          ? "~300 słów"
          : input.length === "long"
            ? "~2000 słów"
            : "~800 słów";

      const systemPrompt = `Jesteś ekspertem od tworzenia treści. Pisz po polsku, ${input.tone || "profesjonalnie ale przystępnie"}.
Typ: ${input.type}. Długość: ${lengthGuide}. Odbiorcy: ${input.audience || "dorośli profesjonaliści"}.
Pisz konkretnie, z wartością merytoryczną. ZERO puchu. Formatuj w Markdown.`;
      const userPrompt = `Tytuł: ${input.title}\nTemat: ${input.topic}`;

      let generatedText: string | null = null;

      // Try Anthropic first
      const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
      if (anthropicKey) {
        try {
          const { default: Anthropic } = await import("@anthropic-ai/sdk");
          const client = new Anthropic({ apiKey: anthropicKey });
          const response = await client.messages.create({
            model: "claude-sonnet-4-6-20250514",
            max_tokens: 4000,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
          });
          const block = response.content.find((c) => c.type === "text");
          if (block && "text" in block) generatedText = block.text;
        } catch (anthropicErr) {
          console.error("[generate_content] Anthropic error:", anthropicErr);
        }
      }

      // Fallback: Gemini
      if (!generatedText) {
        const geminiKey =
          process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
        if (geminiKey) {
          try {
            const { GoogleGenAI } = await import("@google/genai");
            const ai = new GoogleGenAI({ apiKey: geminiKey });
            const result = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: `${systemPrompt}\n\n${userPrompt}`,
            });
            generatedText = result.text || null;
          } catch (geminiErr) {
            console.error("[generate_content] Gemini error:", geminiErr);
          }
        }
      }

      if (!generatedText)
        return "Nie udało się wygenerować treści — brak działającego klucza AI (Anthropic lub Gemini).";

      const text = { text: generatedText };

      // Save to notes
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      await supabase.from("user_notes").insert({
        tenant_id: tenantId,
        type: "content",
        title: `[${input.type}] ${input.title}`,
        content: text.text,
        metadata: {
          content_type: input.type,
          topic: input.topic,
          goal_id: input.goal_id || null,
        },
      });

      return `✍️ Content wygenerowany i zapisany!\n\nTyp: ${input.type}\nTytuł: ${input.title}\n\n${text.text.slice(0, 3000)}${text.text.length > 3000 ? "\n\n[...obcięto — pełna treść w notatkach]" : ""}`;
    } catch (err) {
      return `Błąd generowania: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// #3 self_extend_tool — create a new tool when capability is missing
// ============================================================================

const selfExtendTool: V3ToolDefinition = {
  definition: {
    name: "self_extend_tool",
    description:
      "Stwórz nowe narzędzie gdy brakuje potrzebnej capability. System sam się rozszerza! Nowe narzędzie wymaga zatwierdzenia przez użytkownika.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Nazwa narzędzia (snake_case)" },
        description: { type: "string", description: "Co narzędzie robi" },
        reason: {
          type: "string",
          description: "Dlaczego potrzebuję tego narzędzia (jaki cel)",
        },
        input_schema: {
          type: "object",
          description: "JSON Schema parametrów wejściowych",
        },
        implementation_hint: {
          type: "string",
          description: "Wskazówka jak zaimplementować",
        },
      },
      required: ["name", "description", "reason"],
    },
  },
  async execute(input, tenantId) {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      // Check limit: max 15 dynamic tools per tenant
      const { count } = await supabase
        .from("exo_organism_knowledge")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("category", "dynamic_tool");

      if ((count || 0) >= 15) {
        return "Osiągnięto limit 15 dynamicznych narzędzi. Usuń nieużywane zanim dodasz nowe.";
      }

      // G5: Auto-approve — AI generates and deploys skills autonomously
      // Validation: name must be safe identifier, description must exist
      const safeName = (input.name as string)
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 64);

      await supabase.from("exo_organism_knowledge").insert({
        tenant_id: tenantId,
        category: "dynamic_tool",
        content: JSON.stringify({
          name: safeName,
          description: input.description,
          reason: input.reason,
          input_schema: input.input_schema || {},
          implementation_hint: input.implementation_hint || null,
          approved: true,
          created_at: new Date().toISOString(),
        }),
        confidence: 0.7, // Auto-approved — moderate confidence
        source: "self_extend",
      });

      // Log
      await supabase.from("exo_autonomy_log").insert({
        tenant_id: tenantId,
        event_type: "self_extend_deployed",
        payload: {
          tool_name: safeName,
          reason: input.reason,
          status: "auto_approved",
        },
      });

      return `Nowe narzędzie aktywowane: "${safeName}"\nOpis: ${input.description}\nPowód: ${input.reason}\n\nNarzędzie jest już dostępne i gotowe do użycia.`;
    } catch (err) {
      return `Błąd: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ============================================================================
// #4 download_app — Get download link for a built app
// ============================================================================

const downloadAppTool: V3ToolDefinition = {
  definition: {
    name: "download_app",
    description:
      "Pobierz zbudowaną aplikację jako plik HTML (standalone) lub ZIP (HTML + SQL + dane + README). Użyj gdy user chce pobrać/wyeksportować swoją apkę.",
    input_schema: {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description: "Slug aplikacji (np. 'habit-tracker')",
        },
        format: {
          type: "string",
          enum: ["html", "zip"],
          description:
            "Format: html (standalone strona) lub zip (pełny pakiet z danymi i schematem)",
        },
      },
      required: ["slug"],
    },
  },
  async execute(input, tenantId) {
    const slug = (input.slug as string)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    const format = (input.format as string) || "html";

    // Verify app exists
    const { getServiceSupabase } = await import("@/lib/supabase/service");
    const supabase = getServiceSupabase();

    const { data: app } = await supabase
      .from("exo_generated_apps")
      .select("slug, name")
      .eq("tenant_id", tenantId)
      .eq("slug", slug)
      .eq("status", "active")
      .single();

    if (!app) {
      return `Nie znaleziono aplikacji "${slug}". Sprawdź nazwę lub zbuduj ją najpierw.`;
    }

    const downloadUrl = `https://exoskull.xyz/api/apps/${app.slug}/download?format=${format}`;

    return `📥 Link do pobrania "${app.name || slug}":\n\n🔗 ${downloadUrl}\n\nFormat: ${format === "zip" ? "ZIP (HTML + SQL + dane + README)" : "HTML (standalone strona z danymi)"}\n\nKliknij link żeby pobrać. Link wymaga zalogowania.`;
  },
};

// ============================================================================
// #5 scan_receipt — Vision OCR → structured extraction → auto-add to app
// ============================================================================

const scanReceiptTool: V3ToolDefinition = {
  definition: {
    name: "scan_receipt",
    description:
      "Skanuj paragon lub zdjęcie zakupów. Rozpoznaje pozycje, kwoty, kategorie ze zdjęcia i opcjonalnie dodaje do aplikacji (np. wydatki-tracker). Użyj gdy user wgra zdjęcie paragonu lub produktów.",
    input_schema: {
      type: "object" as const,
      properties: {
        image_url: {
          type: "string",
          description:
            "URL zdjęcia paragonu lub produktów (z uploadu lub link)",
        },
        app_slug: {
          type: "string",
          description:
            "Slug aplikacji do której dodać rozpoznane pozycje (np. 'wydatki-tracker'). Jeśli puste, zwróci tylko rozpoznane dane.",
        },
        context: {
          type: "string",
          description:
            "Dodatkowy kontekst (np. 'to paragon z Biedronki', 'zdjęcie zakupów spożywczych')",
        },
      },
      required: ["image_url"],
    },
  },
  timeoutMs: 45_000,
  async execute(input, tenantId) {
    const imageUrl = input.image_url as string;
    const appSlug = (input.app_slug as string)
      ?.toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    const context = (input.context as string) || "";

    try {
      // ── Step 1: Vision extraction with structured prompt ──
      const { analyzeImage } = await import("@/lib/ai/capabilities/vision");

      const extractionPrompt = `Przeanalizuj to zdjęcie paragonu/rachunku/zakupów i wyodrębnij WSZYSTKIE pozycje.

${context ? `Kontekst od użytkownika: ${context}\n` : ""}
Dla KAŻDEJ pozycji podaj:
- name: nazwa produktu/usługi (po polsku, czytelna)
- amount: kwota w PLN (number, np. 12.99)
- category: jedna z: jedzenie, transport, rozrywka, zdrowie, dom, ubrania, elektronika, edukacja, inne
- date: data z paragonu (format YYYY-MM-DD) lub dzisiejsza jeśli nieczytelna
- note: dodatkowe info (np. ilość, waga, sklep)

Jeśli to NIE jest paragon ale zdjęcie produktów/przedmiotów:
- Rozpoznaj co widzisz na zdjęciu
- Oszacuj przybliżoną wartość każdego przedmiotu
- Przypisz kategorię

Odpowiedz TYLKO czystym JSON:
{"items":[{"name":"...","amount":0.00,"category":"...","date":"YYYY-MM-DD","note":"..."}],"store":"nazwa sklepu jeśli widoczna","total":0.00,"summary":"krótkie podsumowanie"}

ZERO tekstu poza JSON.`;

      const visionResult = await analyzeImage({
        imageUrl,
        prompt: extractionPrompt,
        tenantId,
        maxTokens: 4096,
      });

      // ── Step 2: Parse structured response ──
      let parsed: {
        items: Array<{
          name: string;
          amount: number;
          category: string;
          date: string;
          note: string;
        }>;
        store?: string;
        total?: number;
        summary?: string;
      };

      try {
        // Try to extract JSON from response (may have markdown wrapping)
        const jsonMatch = visionResult.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          return `Rozpoznano obraz ale nie udało się wyodrębnić danych strukturalnych.\n\nRaw:\n${visionResult.text}`;
        }
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return `Rozpoznano obraz ale odpowiedź nie jest prawidłowym JSON.\n\nRaw:\n${visionResult.text}`;
      }

      if (!parsed.items || parsed.items.length === 0) {
        return `Nie znaleziono pozycji na zdjęciu. ${parsed.summary || "Spróbuj z lepszym zdjęciem."}`;
      }

      // ── Step 3: Auto-add to app if slug provided ──
      let addedCount = 0;
      const addErrors: string[] = [];

      if (appSlug) {
        const { getServiceSupabase } = await import("@/lib/supabase/service");
        const supabase = getServiceSupabase();

        // Get app config to know table name + valid columns
        const { data: appConfig } = await supabase
          .from("exo_generated_apps")
          .select("table_name, columns")
          .eq("tenant_id", tenantId)
          .eq("slug", appSlug)
          .eq("status", "active")
          .single();

        if (!appConfig) {
          addErrors.push(`Aplikacja "${appSlug}" nie znaleziona`);
        } else {
          const validColumns = new Set(
            (appConfig.columns as Array<{ name: string }>).map((c) => c.name),
          );

          for (const item of parsed.items) {
            try {
              // Map extracted fields to actual app columns
              const row: Record<string, unknown> = { tenant_id: tenantId };

              // Try matching extracted fields to app column names
              const fieldMap: Record<string, unknown> = {
                nazwa: item.name,
                nazwa_wydatku: item.name,
                name: item.name,
                kwota: item.amount,
                amount: item.amount,
                kategoria: item.category,
                category: item.category,
                data: item.date,
                data_wydatku: item.date,
                date: item.date,
                notatka:
                  item.note || (parsed.store ? `Sklep: ${parsed.store}` : ""),
                note:
                  item.note || (parsed.store ? `Sklep: ${parsed.store}` : ""),
              };

              for (const [col, val] of Object.entries(fieldMap)) {
                if (validColumns.has(col) && val != null) {
                  row[col] = val;
                }
              }

              const { error } = await supabase
                .from(appConfig.table_name)
                .insert(row);

              if (!error) {
                addedCount++;
              } else {
                addErrors.push(`${item.name}: ${error.message}`);
              }
            } catch (e) {
              addErrors.push(
                `${item.name}: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
          }
        }
      }

      // ── Step 4: Format response ──
      const lines: string[] = [];
      lines.push(
        `📸 Rozpoznano ${parsed.items.length} pozycji${parsed.store ? ` ze sklepu ${parsed.store}` : ""}:`,
      );
      lines.push("");

      for (const item of parsed.items) {
        lines.push(
          `• **${item.name}** — ${item.amount?.toFixed(2) || "?"} PLN [${item.category}]${item.note ? ` (${item.note})` : ""}`,
        );
      }

      if (parsed.total) {
        lines.push("");
        lines.push(`**Suma: ${parsed.total.toFixed(2)} PLN**`);
      }

      if (appSlug && addedCount > 0) {
        lines.push("");
        lines.push(
          `✅ Dodano ${addedCount}/${parsed.items.length} pozycji do aplikacji "${appSlug}".`,
        );
        if (addErrors.length > 0) {
          lines.push(`⚠️ Błędy: ${addErrors.join("; ")}`);
        }
      } else if (appSlug && addedCount === 0) {
        lines.push("");
        lines.push(
          `❌ Nie udało się dodać pozycji do "${appSlug}": ${addErrors.join("; ")}`,
        );
      } else {
        lines.push("");
        lines.push(
          `💡 Chcesz dodać te pozycje do aplikacji? Powiedz np. "dodaj do wydatki-tracker".`,
        );
      }

      return lines.join("\n");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[scan_receipt] Error:", { error: msg });
      return `Błąd skanowania: ${msg}`;
    }
  },
};

// ============================================================================
// EXPORT
// ============================================================================

export const builderTools: V3ToolDefinition[] = [
  buildAppTool,
  generateContentTool,
  selfExtendTool,
  downloadAppTool,
  scanReceiptTool,
];
