/**
 * v3 App Builder Tools — Phase 5
 *
 * BMAD Pipeline: PM → Architect → Developer → Reviewer → Deploy
 * Real code generation, not JSON specs.
 *
 * 3 tools: build_app, generate_content, self_extend_tool
 */

import type { V3ToolDefinition } from "./index";

// ============================================================================
// #1 build_app — BMAD pipeline for app generation
// ============================================================================

const buildAppTool: V3ToolDefinition = {
  definition: {
    name: "build_app",
    description:
      "Zbuduj działającą aplikację webową i od razu ją udostępnij pod URL. Generuje standalone HTML z Tailwind CSS + vanilla JS. Użyj gdy użytkownik chce nową appkę/narzędzie.",
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
            "Lista funkcji (np. ['dodawanie nawyków', 'streak tracker', 'wykresy postępu'])",
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

    // Sanitize slug: lowercase, alphanumeric + hyphens only
    const slug = rawName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (!slug) return "Nieprawidłowa nazwa aplikacji.";

    try {
      const geminiKey =
        process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
      const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();

      // Single prompt: generate complete standalone HTML app
      const prompt = `Wygeneruj KOMPLETNĄ, DZIAŁAJĄCĄ aplikację webową jako JEDEN plik HTML.

Nazwa: "${rawName}"
Opis: ${description}
Funkcje: ${features.join(", ") || "podstawowe"}

WYMAGANIA TECHNICZNE:
- Kompletny plik HTML5 z <!DOCTYPE html>
- Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Dane przechowuj w localStorage (JSON)
- Vanilla JavaScript (bez frameworków)
- Responsywny design (mobile-first)
- Ciemny motyw (dark mode)
- Polskie UI (napisy, przyciski po polsku)
- CRUD operacje jeśli potrzebne
- Profesjonalny, nowoczesny wygląd
- Kompletna funkcjonalność (nie stub/placeholder)
- Max 200 linii — zwięzły ale pełny kod

Odpowiedz TYLKO czystym JSON:
{"html":"<!DOCTYPE html>...cały kod HTML...","title":"Tytuł aplikacji"}

ZERO tekstu poza JSON. Cały HTML w jednym stringu w polu "html".`;

      let html: string | null = null;
      let title: string = rawName;

      const errors: string[] = [];

      // Try Gemini 2.5 Flash (JSON mode) with retries on 429
      if (geminiKey) {
        for (let attempt = 0; attempt < 3 && !html; attempt++) {
          try {
            if (attempt > 0) {
              const delay = (attempt + 1) * 5000; // 10s, 15s
              console.log(
                `[build_app] Gemini retry ${attempt}/2, waiting ${delay}ms`,
              );
              await new Promise((r) => setTimeout(r, delay));
            }
            const { GoogleGenAI } = await import("@google/genai");
            const ai = new GoogleGenAI({ apiKey: geminiKey });
            const result = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: prompt,
              config: {
                responseMimeType: "application/json",
                maxOutputTokens: 8192,
              },
            });
            const text = result.text;
            if (text) {
              const parsed = JSON.parse(text);
              html = parsed.html || null;
              title = parsed.title || rawName;
            }
          } catch (geminiErr) {
            const msg =
              geminiErr instanceof Error
                ? geminiErr.message
                : JSON.stringify(geminiErr);
            if (msg.includes("429") && attempt < 2) continue; // retry on rate limit
            errors.push(`Gemini: ${msg.slice(0, 200)}`);
            console.error("[build_app] Gemini error:", msg);
          }
        }
      }

      // Fallback: Anthropic
      if (!html && anthropicKey) {
        try {
          const { default: Anthropic } = await import("@anthropic-ai/sdk");
          const client = new Anthropic({ apiKey: anthropicKey });
          const response = await client.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 8000,
            system:
              "Odpowiadasz TYLKO czystym JSON. Zero markdown, zero komentarzy. Klucz 'html' zawiera kompletny HTML string.",
            messages: [{ role: "user", content: prompt }],
          });
          const block = response.content.find((c) => c.type === "text");
          if (block && "text" in block) {
            const raw = block.text.trim();
            // Extract JSON from possible markdown wrapping
            const jsonStr = raw.startsWith("{")
              ? raw
              : raw.match(/\{[\s\S]*\}/)?.[0] || raw;
            const parsed = JSON.parse(jsonStr);
            html = parsed.html || null;
            title = parsed.title || rawName;
          }
        } catch (anthropicErr) {
          const msg =
            anthropicErr instanceof Error
              ? anthropicErr.message
              : JSON.stringify(anthropicErr);
          errors.push(`Anthropic: ${msg.slice(0, 200)}`);
          console.error("[build_app] Anthropic error:", msg);
        }
      }

      if (!html) {
        return `Nie udało się wygenerować aplikacji. Błędy: ${errors.join(" | ") || "brak kluczy AI"}`;
      }

      // Validate it looks like HTML
      if (!html.includes("<html") && !html.includes("<!DOCTYPE")) {
        return "Wygenerowany kod nie wygląda na poprawny HTML — spróbuj ponownie.";
      }

      // === Store generated app ===
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      // Upsert: if slug already exists for this tenant, update it
      const { data: existing } = await supabase
        .from("exo_organism_knowledge")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("category", "generated_app")
        .eq("source", slug)
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
          source: slug,
        });
      }

      // Log the build event
      await supabase.from("exo_autonomy_log").insert({
        tenant_id: tenantId,
        event_type: "app_built",
        payload: {
          name: rawName,
          slug,
          title,
          description,
          features,
          goal_id: input.goal_id || null,
          html_size: html.length,
          status: "live",
        },
      });

      const appUrl = `https://exoskull.xyz/api/apps/${slug}`;

      return `🚀 App "${title}" jest LIVE!\n\n🔗 ${appUrl}\n\nSlug: ${slug}\nRozmiar: ${html.length} znaków\nStack: HTML5 + Tailwind CSS + vanilla JS + localStorage\n\nAplikacja jest dostępna pod powyższym linkiem. Możesz ją otworzyć w przeglądarce.`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
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

      // Store tool spec (approved: false — needs user approval)
      await supabase.from("exo_organism_knowledge").insert({
        tenant_id: tenantId,
        category: "dynamic_tool",
        content: JSON.stringify({
          name: input.name,
          description: input.description,
          reason: input.reason,
          input_schema: input.input_schema || {},
          implementation_hint: input.implementation_hint || null,
          approved: false,
          created_at: new Date().toISOString(),
        }),
        confidence: 0.3, // Low until approved
        source: "self_extend",
      });

      // Log
      await supabase.from("exo_autonomy_log").insert({
        tenant_id: tenantId,
        event_type: "self_extend_requested",
        payload: {
          tool_name: input.name,
          reason: input.reason,
          status: "pending_approval",
        },
      });

      return `🔧 Nowe narzędzie zaproponowane: "${input.name}"\nOpis: ${input.description}\nPowód: ${input.reason}\n\n⚠️ Wymaga zatwierdzenia przez użytkownika. Zapytaj go czy chce aktywować to narzędzie.`;
    } catch (err) {
      return `Błąd: ${err instanceof Error ? err.message : String(err)}`;
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
];
