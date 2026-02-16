/**
 * Diagnostic endpoint: test each AI provider individually.
 * GET /api/debug/ai-providers?secret=CRON_SECRET
 *
 * Tests Gemini, Anthropic, OpenAI with a simple prompt (no tools).
 * Then tests Gemini with 5 tools to isolate tool-related issues.
 */
import { NextResponse } from "next/server";

export const maxDuration = 55;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  // 1. Test Gemini 3 Flash (primary model)
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not set");

    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: "Say hello in Polish" }] }],
      config: { maxOutputTokens: 50, temperature: 0.1 },
    });
    results.gemini3Flash = {
      status: "OK",
      text: res.text?.slice(0, 100),
    };
  } catch (e: any) {
    results.gemini3Flash = {
      status: "FAILED",
      error: e.message,
      code: e.status || e.code,
      stack: e.stack?.split("\n").slice(0, 3).join("\n"),
    };
  }

  // 2. Test Gemini 2.5 Flash (emergency fallback model)
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not set");

    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: "Say hello in Polish" }] }],
      config: { maxOutputTokens: 50, temperature: 0.1 },
    });
    results.gemini25Flash = {
      status: "OK",
      text: res.text?.slice(0, 100),
    };
  } catch (e: any) {
    results.gemini25Flash = {
      status: "FAILED",
      error: e.message,
      code: e.status || e.code,
    };
  }

  // 3. Test Gemini 3 Flash WITH tools (5 simple tools)
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not set");

    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: "What is 2+2?" }] }],
      config: {
        maxOutputTokens: 50,
        temperature: 0.1,
        tools: [
          {
            functionDeclarations: [
              {
                name: "calculator",
                description: "Calculate math expression",
                parameters: {
                  type: "object" as any,
                  properties: {
                    expression: {
                      type: "string" as any,
                      description: "Math expression",
                    },
                  },
                  required: ["expression"],
                },
              },
            ],
          },
        ],
      },
    });
    results.gemini3FlashWithTools = {
      status: "OK",
      text: res.text?.slice(0, 100),
      functionCalls: res.functionCalls?.map((fc) => fc.name),
    };
  } catch (e: any) {
    results.gemini3FlashWithTools = {
      status: "FAILED",
      error: e.message,
      code: e.status || e.code,
    };
  }

  // 4. Test Anthropic (Claude Haiku 3.5)
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 50,
      messages: [{ role: "user", content: "Say hello in Polish" }],
    });
    const textBlock = res.content.find((c) => c.type === "text");
    results.anthropicHaiku = {
      status: "OK",
      text:
        textBlock && "text" in textBlock
          ? (textBlock as any).text.slice(0, 100)
          : "(no text)",
      stopReason: res.stop_reason,
    };
  } catch (e: any) {
    results.anthropicHaiku = {
      status: "FAILED",
      error: e.message,
      code: e.status,
      type: e.error?.type,
      anthropicMessage: e.error?.message,
    };
  }

  // 5. Test OpenAI (GPT-4o)
  try {
    const OpenAI = (await import("openai")).default;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");

    const client = new OpenAI({ apiKey });
    const res = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 50,
      messages: [{ role: "user", content: "Say hello in Polish" }],
    });
    results.openaiGpt4o = {
      status: "OK",
      text: res.choices[0]?.message?.content?.slice(0, 100),
    };
  } catch (e: any) {
    results.openaiGpt4o = {
      status: "FAILED",
      error: e.message,
      code: e.status,
    };
  }

  // 6. Environment check
  results.envCheck = {
    GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY
      ? `set (${process.env.GOOGLE_AI_API_KEY.slice(0, 6)}...)`
      : "NOT SET",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY
      ? `set (${process.env.ANTHROPIC_API_KEY.slice(0, 6)}...)`
      : "NOT SET",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY
      ? `set (${process.env.OPENAI_API_KEY.slice(0, 6)}...)`
      : "NOT SET",
  };

  return NextResponse.json(results, { status: 200 });
}
