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

    try {
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) return "Brak ANTHROPIC_API_KEY — nie mogę budować.";

      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: anthropicKey });

      // === PHASE 1: PM — Generate PRD (Haiku, cheap) ===
      const prdResponse = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: `Jesteś Product Managerem. Napisz krótki PRD (Product Requirements Document) dla mini-aplikacji.
Format JSON: {"title": "...", "user_stories": ["As a user, I want to..."], "data_model": [{"table": "...", "columns": [...]}], "api_endpoints": [{"method": "GET/POST", "path": "...", "description": "..."}], "ui_components": ["..."]}
Limit: 1 tabela DB, max 3 endpointy, max 3 komponenty UI. MINIMALIZM.`,
        messages: [
          {
            role: "user",
            content: `App: "${name}"\nOpis: ${description}\nFunkcje: ${features.join(", ")}`,
          },
        ],
      });

      const prdText = prdResponse.content.find((c) => c.type === "text");
      if (!prdText || !("text" in prdText))
        return "Nie udało się wygenerować PRD.";

      let prd: Record<string, unknown>;
      try {
        prd = JSON.parse(prdText.text);
      } catch {
        return `PM wygenerował nieprawidłowy PRD. Spróbuję ponownie przy następnym podejściu.`;
      }

      // === PHASE 2: Developer — Generate Code (Sonnet) ===
      const codeResponse = await client.messages.create({
        model: "claude-sonnet-4-6-20250514",
        max_tokens: 4000,
        system: `Jesteś senior developerem. Na podstawie PRD napisz KOMPLETNY kod aplikacji.
Stack: Next.js App Router, Supabase (Postgres), Tailwind CSS.

Zwróć JSON z plikami:
{"files": [{"path": "app/apps/${name}/page.tsx", "content": "..."}, {"path": "supabase/migrations/...", "content": "..."}]}

Zasady:
- JEDEN plik page.tsx z PEŁNYM kodem (komponent + logika + UI)
- 'use client' na górze
- Supabase client via createBrowserClient()
- Tailwind dla stylów
- KOMPLETNY, działający kod — nie stubs
- Max 200 LOC per file`,
        messages: [
          {
            role: "user",
            content: `PRD:\n${JSON.stringify(prd, null, 2)}`,
          },
        ],
      });

      const codeText = codeResponse.content.find((c) => c.type === "text");
      if (!codeText || !("text" in codeText))
        return "Developer nie wygenerował kodu.";

      let codeResult: { files: { path: string; content: string }[] };
      try {
        codeResult = JSON.parse(codeText.text);
      } catch {
        return `Developer wygenerował nieprawidłowy JSON. Spróbuję ponownie.`;
      }

      if (!codeResult.files?.length)
        return "Developer nie wygenerował żadnych plików.";

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
