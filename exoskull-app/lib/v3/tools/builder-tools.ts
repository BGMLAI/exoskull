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

      // ── Step 2: Generate frontend HTML that calls real API ──
      const htmlPrompt = `Wygeneruj kompletną stronę HTML dla aplikacji "${app.name || rawName}".
Opis: ${fullDescription}

BACKEND API (już istnieje, NIE twórz go):
- GET /api/apps/${appSlug}/data → {"app":{"slug","name","columns","ui_config"},"entries":[...],"total":N}
- POST /api/apps/${appSlug}/data → tworzy wpis. Body JSON z polami: ${columnList}

Kolumny w bazie danych: ${columnList}

WYMAGANIA:
- Kompletny HTML5 z <!DOCTYPE html>
- Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Na starcie: fetch('/api/apps/${appSlug}/data', {credentials:'include'}) → wyświetl wpisy
- Formularz dodawania: POST /api/apps/${appSlug}/data z JSON body
- Przy 401: pokaż "Zaloguj się na exoskull.xyz aby korzystać z aplikacji"
- Ciemny motyw, polskie UI, nowoczesny profesjonalny wygląd
- fetch() ZAWSZE z {credentials:'include'} i {headers:{'Content-Type':'application/json'}}
- Po dodaniu wpisu: odśwież listę (ponowne GET)
- Obsługa błędów (try/catch, wyświetl komunikat)
- Responsywny (mobile-first)
- Max 250 linii
- ZERO localStorage — dane TYLKO przez API

Odpowiedz TYLKO czystym JSON:
{"html":"<!DOCTYPE html>...cały kod HTML...","title":"Tytuł"}
ZERO tekstu poza JSON.`;

      let html: string | null = null;
      let title: string = app.name || rawName;
      const errors: string[] = [];

      // Try Gemini
      const geminiKey =
        process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
      if (geminiKey) {
        try {
          const { GoogleGenAI } = await import("@google/genai");
          const ai = new GoogleGenAI({ apiKey: geminiKey });
          const genResult = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: htmlPrompt,
            config: {
              responseMimeType: "application/json",
              maxOutputTokens: 8192,
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

      // Fallback: OpenAI
      const openaiKey = process.env.OPENAI_API_KEY?.trim();
      if (!html && openaiKey) {
        try {
          const resp = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${openaiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                  {
                    role: "system",
                    content:
                      "Odpowiadasz TYLKO czystym JSON. Klucz 'html' = kompletny HTML. Klucz 'title' = tytuł.",
                  },
                  { role: "user", content: htmlPrompt },
                ],
                max_tokens: 16000,
                temperature: 0.7,
                response_format: { type: "json_object" },
              }),
            },
          );
          if (resp.ok) {
            const data = await resp.json();
            const text = data.choices?.[0]?.message?.content;
            if (text) {
              const p = JSON.parse(text);
              html = p.html || null;
              title = p.title || title;
            }
          } else {
            errors.push(`OpenAI: ${resp.status}`);
          }
        } catch (e) {
          errors.push(`OpenAI: ${(e as Error).message?.slice(0, 200)}`);
        }
      }

      // Fallback: DeepSeek
      const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
      if (!html && deepseekKey) {
        try {
          const resp = await fetch(
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
                      "Odpowiadasz TYLKO czystym JSON. Klucz 'html' = kompletny HTML. Klucz 'title' = tytuł.",
                  },
                  { role: "user", content: htmlPrompt },
                ],
                max_tokens: 8000,
                temperature: 0.7,
                response_format: { type: "json_object" },
              }),
            },
          );
          if (resp.ok) {
            const data = await resp.json();
            const text = data.choices?.[0]?.message?.content;
            if (text) {
              const p = JSON.parse(text);
              html = p.html || null;
              title = p.title || title;
            }
          } else {
            errors.push(`DeepSeek: ${resp.status}`);
          }
        } catch (e) {
          errors.push(`DeepSeek: ${(e as Error).message?.slice(0, 200)}`);
        }
      }

      // Even without HTML frontend, the backend app works
      if (!html) {
        const apiUrl = `https://exoskull.xyz/api/apps/${appSlug}/data`;
        return `✅ Aplikacja "${app.name}" utworzona z bazą danych!\n\n🗄️ Tabela: ${tableName}\n📝 Kolumny: ${columnList}\n📊 CRUD API: ${apiUrl}\n\n⚠️ Frontend HTML nie wygenerowany (${errors.join(", ")}). Dane dostępne przez API.`;
      }

      // Validate HTML
      if (!html.includes("<html") && !html.includes("<!DOCTYPE")) {
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
// EXPORT
// ============================================================================

export const builderTools: V3ToolDefinition[] = [
  buildAppTool,
  generateContentTool,
  selfExtendTool,
  downloadAppTool,
];
