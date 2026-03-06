/**
 * Gemini Smart Router — classify queries and handle simple ones via Gemini Flash
 *
 * Simple queries (greetings, basic questions, no tool needs) → Gemini Flash (<1s)
 * Complex queries (goals, memory, building, tool-requiring) → Claude Sonnet (with tools)
 */

import { logger } from "@/lib/logger";

// Keywords that indicate tool-requiring queries
const TOOL_KEYWORDS = [
  // Goals & tasks
  "cel",
  "zadanie",
  "task",
  "goal",
  "priorytet",
  "postęp",
  "progress",
  "stwórz",
  "utwórz",
  "create",
  "update",
  "aktualizuj",
  "oznacz",
  // Memory & knowledge
  "zapamiętaj",
  "remember",
  "pamiętasz",
  "pamięć",
  "wiesz o mnie",
  "notatk",
  "zanotuj",
  "podsumuj",
  "podsumowanie",
  // Building
  "zbuduj",
  "build",
  "aplikacj",
  "app",
  "umiejętność",
  "skill",
  // Knowledge
  "zaimportuj",
  "import",
  "dokument",
  "baza wiedzy",
  "knowledge",
  "wyszukaj",
  "szukaj w internecie",
  "search",
  // Channels
  "sms",
  "email",
  "wyślij",
  "send",
  "zadzwoń",
  "call",
  // Autonomy
  "uprawnienia",
  "permission",
  "autonomi",
  "zaplanuj",
  "powiadomienie",
  // Evolution & self-awareness
  "zdolności",
  "capabilities",
  "oceń",
  "reflexion",
  "potrafisz",
  "umiesz",
  "kim jesteś",
  "who are you",
  "what can you",
  "możliwości",
  "funkcj",
  "narzędzi",
  // Vision
  "obraz",
  "image",
  "zdjęcie",
  "screenshot",
  "ocr",
  // Emotional
  "stres",
  "emocj",
  "samopoczucie",
];

// Patterns indicating simple conversational queries (Gemini Flash — free)
const SIMPLE_PATTERNS = [
  /^(cześć|hej|siema|hello|hi|hey|witaj|dzień dobry|dobry|yo)\b/i,
  // NOTE: "co potrafisz/co umiesz/kim jesteś" moved to TOOL_KEYWORDS — need tools to answer accurately
  /^(dzięk|thanks|thx|dziękuję|spoko)/i,
  /^(ok|okay|dobrze|rozumiem|jasne|super|fajnie|great|git|luzik)\s*[.!]?$/i,
  /^(jak się masz|co słychać|how are you|co tam)/i,
  /^(pomoc|help)\s*$/i,
  /^(haha|lol|xd|😂|👍|❤️|🔥)/i,
  /^(dobranoc|pa|nara|cześć|do zobaczenia|bye)\b/i,
  /^(co to|czym jest|what is|explain)\s.{0,30}$/i, // short "what is X" questions
];

export type QueryComplexity = "simple" | "medium" | "complex";

// Keywords that require Sonnet (heavy tool use, building, multi-step)
const SONNET_KEYWORDS = [
  "zbuduj",
  "build",
  "aplikacj",
  "app",
  "generate",
  "kurs",
  "ebook",
  "blog",
  "self_extend",
  "publish",
  "allegro",
];

/**
 * 3-tier classification:
 * simple  → Gemini Flash (no tools, ~$0.00)
 * medium  → Haiku (with tools, ~$0.01)
 * complex → Sonnet (heavy building/generation, ~$0.15)
 */
export function classifyQuery(message: string): QueryComplexity {
  const lower = message.toLowerCase().trim();

  // Very short messages that are greetings/acknowledgments
  if (lower.length < 30) {
    for (const pattern of SIMPLE_PATTERNS) {
      if (pattern.test(lower)) return "simple";
    }
  }

  // Sonnet-requiring keywords (building apps, generating content)
  for (const keyword of SONNET_KEYWORDS) {
    if (lower.includes(keyword)) return "complex";
  }

  // Tool-requiring keywords → Haiku (NOT Sonnet)
  for (const keyword of TOOL_KEYWORDS) {
    if (lower.includes(keyword)) return "medium";
  }

  // Commands (starting with /) → medium (tools likely needed)
  if (lower.startsWith("/")) return "medium";

  // Questions → medium (might need tools for context)
  if (lower.includes("?") && lower.length > 50) return "medium";

  // Short conversational messages without tool keywords → simple
  if (lower.length < 100 && !lower.includes("?")) return "simple";

  // Default: medium (Haiku — cheaper than Sonnet, still has tools)
  return "medium";
}

/**
 * Handle a simple query via Gemini Flash.
 * Returns response text or null if Gemini fails.
 */
export async function handleSimpleQuery(
  message: string,
  tenantName?: string,
  recentHistory?: Array<{ role: string; content: string }>,
): Promise<string | null> {
  const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: geminiKey });

    // Build minimal context
    const historyText = recentHistory
      ? recentHistory
          .slice(-4)
          .map((m) => `${m.role === "user" ? "User" : "IORS"}: ${m.content}`)
          .join("\n")
      : "";

    const prompt = `Jesteś IORS — inteligentny asystent w systemie ExoSkull. Odpowiadasz krótko, naturalnie, po polsku (chyba że user pisze w innym języku).
${tenantName ? `User: ${tenantName}` : ""}
${historyText ? `\nOstatnia rozmowa:\n${historyText}` : ""}

User: ${message}

Odpowiedz zwięźle (1-3 zdania). Bądź ciepły ale konkretny.`;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = result.text;
    if (!text) return null;

    logger.info("[GeminiRouter] Simple query handled via Gemini Flash", {
      messageLength: message.length,
      responseLength: text.length,
    });

    return text;
  } catch (error) {
    logger.warn("[GeminiRouter] Gemini Flash failed, falling back to Claude", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
