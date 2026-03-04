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
      "Zbuduj prawdziwą aplikację (React + API + DB). BMAD pipeline: PM→PRD, Architect→design, Developer→code, Reviewer→review, Deploy. Użyj gdy cel użytkownika wymaga nowego narzędzia/aplikacji.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description:
            "Nazwa aplikacji (np. 'habit-tracker', 'expense-manager')",
        },
        description: { type: "string", description: "Co aplikacja ma robić" },
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
    const name = input.name as string;
    const description = input.description as string;
    const features = (input.features as string[]) || [];

    // Helper: extract JSON from text that may contain markdown code blocks
    function extractJSON(text: string): string {
      // Try raw first
      const trimmed = text.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
      // Strip ```json ... ``` or ``` ... ```
      const match = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (match) return match[1].trim();
      // Find first { to last }
      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");
      if (start !== -1 && end > start) return trimmed.slice(start, end + 1);
      return trimmed;
    }

    try {
      const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
      const geminiKey =
        process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;

      const prdPrompt = `Napisz krótki PRD dla mini-aplikacji.
App: "${name}". Opis: ${description}. Funkcje: ${features.join(", ") || "podstawowe"}.
Odpowiedz TYLKO czystym JSON:
{"title":"...","user_stories":["..."],"data_model":[{"table":"...","columns":["id uuid","name text","created_at timestamp"]}],"api_endpoints":[{"method":"GET","path":"/api/...","description":"..."}],"ui_components":["..."]}
Limit: 1 tabela, max 3 endpointy, max 3 komponenty. MINIMALIZM. ZERO tekstu poza JSON.`;

      // === PHASE 1: PM — Generate PRD (Gemini JSON mode first, Anthropic fallback) ===
      let prd: Record<string, unknown> | null = null;

      // Try Gemini first with JSON mode (guaranteed valid JSON)
      if (!prd && geminiKey) {
        try {
          const { GoogleGenAI } = await import("@google/genai");
          const ai = new GoogleGenAI({ apiKey: geminiKey });
          const result = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prdPrompt,
            config: { responseMimeType: "application/json" },
          });
          const text = result.text;
          if (text) prd = JSON.parse(extractJSON(text));
        } catch (geminiErr) {
          console.error("[build_app] Gemini PRD error:", geminiErr);
        }
      }

      // Fallback: Anthropic
      if (!prd && anthropicKey) {
        try {
          const { default: Anthropic } = await import("@anthropic-ai/sdk");
          const client = new Anthropic({ apiKey: anthropicKey });
          const prdResponse = await client.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1500,
            system:
              "Odpowiadasz TYLKO czystym JSON. Zero markdown, zero komentarzy, zero tekstu.",
            messages: [{ role: "user", content: prdPrompt }],
          });
          const prdBlock = prdResponse.content.find((c) => c.type === "text");
          if (prdBlock && "text" in prdBlock) {
            prd = JSON.parse(extractJSON(prdBlock.text));
          }
        } catch (anthropicErr) {
          console.error("[build_app] Anthropic PRD error:", anthropicErr);
        }
      }

      if (!prd) return "Nie udało się wygenerować PRD — spróbuj ponownie.";

      // === PHASE 2: Developer — Generate Code (Gemini JSON mode first) ===
      const codePrompt = `Na podstawie PRD napisz KOMPLETNY kod aplikacji.
Stack: Next.js App Router, Supabase (Postgres), Tailwind CSS.
PRD: ${JSON.stringify(prd)}

Odpowiedz TYLKO czystym JSON:
{"files":[{"path":"app/apps/${name}/page.tsx","content":"'use client';\\nimport..."}]}

Zasady: JEDEN plik page.tsx z PEŁNYM kodem, 'use client' na górze, Supabase via createBrowserClient(), Tailwind, KOMPLETNY kod, max 200 LOC. ZERO tekstu poza JSON.`;

      let codeResult: { files: { path: string; content: string }[] } | null =
        null;

      // Try Gemini first with JSON mode
      if (!codeResult && geminiKey) {
        try {
          const { GoogleGenAI } = await import("@google/genai");
          const ai = new GoogleGenAI({ apiKey: geminiKey });
          const result = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: codePrompt,
            config: { responseMimeType: "application/json" },
          });
          const text = result.text;
          if (text) codeResult = JSON.parse(extractJSON(text));
        } catch (geminiErr) {
          console.error("[build_app] Gemini code error:", geminiErr);
        }
      }

      // Fallback: Anthropic
      if (!codeResult && anthropicKey) {
        try {
          const { default: Anthropic } = await import("@anthropic-ai/sdk");
          const client = new Anthropic({ apiKey: anthropicKey });
          const codeResponse = await client.messages.create({
            model: "claude-sonnet-4-6-20250514",
            max_tokens: 4000,
            system:
              "Odpowiadasz TYLKO czystym JSON. Zero markdown, zero komentarzy.",
            messages: [{ role: "user", content: codePrompt }],
          });
          const codeBlock = codeResponse.content.find((c) => c.type === "text");
          if (codeBlock && "text" in codeBlock) {
            codeResult = JSON.parse(extractJSON(codeBlock.text));
          }
        } catch (anthropicErr) {
          console.error("[build_app] Anthropic code error:", anthropicErr);
        }
      }

      if (!codeResult?.files?.length)
        return "Nie udało się wygenerować kodu — spróbuj ponownie.";

      // === PHASE 3: Store generated app ===
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();

      // Store app metadata
      await supabase.from("exo_autonomy_log").insert({
        tenant_id: tenantId,
        event_type: "app_built",
        payload: {
          name,
          description,
          goal_id: input.goal_id || null,
          files: codeResult.files.map((f) => f.path),
          prd_summary: prd.title || name,
          status: "generated",
        },
      });

      // Store files in knowledge for reference
      await supabase.from("exo_organism_knowledge").insert({
        tenant_id: tenantId,
        category: "fact",
        content: `Zbudowano app "${name}": ${codeResult.files.map((f) => f.path).join(", ")}`,
        confidence: 0.9,
        source: "build_app",
      });

      const fileList = codeResult.files
        .map((f) => `  📄 ${f.path} (${f.content.length} chars)`)
        .join("\n");
      return `🏗️ App "${name}" zbudowana!\n\nPliki:\n${fileList}\n\nPRD: ${(prd.title as string) || name}\nStatus: generated (gotowe do review i deploy)\n\nNastępny krok: review kodu i deploy na VPS/Vercel.`;
    } catch (err) {
      return `Błąd budowania: ${err instanceof Error ? err.message : String(err)}`;
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
