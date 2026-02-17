/**
 * Diagnostic endpoint: test each AI provider individually
 * GET /api/debug/ai-test?secret=CRON_SECRET
 *
 * Tests: Gemini 3 Flash, Anthropic Haiku, OpenAI GPT-4o, Emergency Gemini 2.5
 * Returns JSON with success/error for each provider
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin/auth";

export const maxDuration = 55;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const isAdmin = await verifyAdmin().catch(() => false);
  if (secret !== process.env.CRON_SECRET && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<
    string,
    { success: boolean; response?: string; error?: string; durationMs: number }
  > = {};
  const testPrompt = "Reply with exactly: OK";
  const testMessages = [{ role: "user" as const, content: testPrompt }];

  // ── Test 1: Gemini 3 Flash (with tools) ──
  try {
    const start = Date.now();
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });
    const resp = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: testPrompt }] }],
      config: {
        systemInstruction: "You are a test bot.",
        maxOutputTokens: 50,
        tools: [
          {
            functionDeclarations: [
              {
                name: "test_tool",
                description: "A test tool",
                parameters: {
                  type: "object" as any,
                  properties: { q: { type: "string" as any } },
                },
              },
            ],
          },
        ],
      },
    });
    results["gemini_3_flash_with_tools"] = {
      success: true,
      response: (resp.text || "").slice(0, 200),
      durationMs: Date.now() - start,
    };
  } catch (e: any) {
    results["gemini_3_flash_with_tools"] = {
      success: false,
      error: `${e.status || ""} ${e.message}`.trim(),
      durationMs: 0,
    };
  }

  // ── Test 2: Gemini 3 Flash (no tools) ──
  try {
    const start = Date.now();
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });
    const resp = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: testPrompt }] }],
      config: {
        systemInstruction: "You are a test bot.",
        maxOutputTokens: 50,
      },
    });
    results["gemini_3_flash_no_tools"] = {
      success: true,
      response: (resp.text || "").slice(0, 200),
      durationMs: Date.now() - start,
    };
  } catch (e: any) {
    results["gemini_3_flash_no_tools"] = {
      success: false,
      error: `${e.status || ""} ${e.message}`.trim(),
      durationMs: 0,
    };
  }

  // ── Test 3: Anthropic Haiku ──
  try {
    const start = Date.now();
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    const resp = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 50,
      messages: [{ role: "user", content: testPrompt }],
    });
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as any).text)
      .join("");
    results["anthropic_haiku"] = {
      success: true,
      response: text.slice(0, 200),
      durationMs: Date.now() - start,
    };
  } catch (e: any) {
    results["anthropic_haiku"] = {
      success: false,
      error: `${e.status || ""} ${e.error?.message || e.message}`.trim(),
      durationMs: 0,
    };
  }

  // ── Test 4: Anthropic Haiku WITH tools ──
  try {
    const start = Date.now();
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    const resp = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 50,
      messages: [{ role: "user", content: testPrompt }],
      tools: [
        {
          name: "test_tool",
          description: "A test tool",
          input_schema: {
            type: "object" as const,
            properties: { q: { type: "string" } },
          },
        },
      ],
    });
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as any).text)
      .join("");
    results["anthropic_haiku_with_tools"] = {
      success: true,
      response: text.slice(0, 200),
      durationMs: Date.now() - start,
    };
  } catch (e: any) {
    results["anthropic_haiku_with_tools"] = {
      success: false,
      error: `${e.status || ""} ${e.error?.message || e.message}`.trim(),
      durationMs: 0,
    };
  }

  // ── Test 5: OpenAI GPT-4o ──
  try {
    const start = Date.now();
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const resp = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 50,
      messages: [
        { role: "system", content: "You are a test bot." },
        { role: "user", content: testPrompt },
      ],
    });
    results["openai_gpt4o"] = {
      success: true,
      response: (resp.choices[0]?.message?.content || "").slice(0, 200),
      durationMs: Date.now() - start,
    };
  } catch (e: any) {
    results["openai_gpt4o"] = {
      success: false,
      error: `${e.status || ""} ${e.message}`.trim(),
      durationMs: 0,
    };
  }

  // ── Test 6: Emergency Gemini 2.5 Flash ──
  try {
    const start = Date.now();
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });
    const resp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: testPrompt }] }],
      config: {
        systemInstruction: "You are a test bot.",
        maxOutputTokens: 50,
      },
    });
    results["gemini_25_flash_emergency"] = {
      success: true,
      response: (resp.text || "").slice(0, 200),
      durationMs: Date.now() - start,
    };
  } catch (e: any) {
    results["gemini_25_flash_emergency"] = {
      success: false,
      error: `${e.status || ""} ${e.message}`.trim(),
      durationMs: 0,
    };
  }

  // ── Summary ──
  const allOk = Object.values(results).every((r) => r.success);

  return NextResponse.json(
    {
      timestamp: new Date().toISOString(),
      allProvidersOk: allOk,
      envKeys: {
        GOOGLE_AI_API_KEY: !!process.env.GOOGLE_AI_API_KEY,
        ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
        OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      },
      results,
    },
    { status: allOk ? 200 : 500 },
  );
}
