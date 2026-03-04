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
  // Evolution
  "zdolności",
  "capabilities",
  "oceń",
  "reflexion",
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

// Patterns indicating simple conversational queries
const SIMPLE_PATTERNS = [
  /^(cześć|hej|siema|hello|hi|hey|witaj|dzień dobry|dobry|yo)\b/i,
  /^(co potrafisz|co umiesz|kim jesteś|what can you|who are you)/i,
  /^(dzięk|thanks|thx|dziękuję)/i,
  /^(ok|okay|dobrze|rozumiem|jasne|super|fajnie|great)\s*[.!]?$/i,
  /^(jak się masz|co słychać|how are you)/i,
  /^(pomoc|help)\s*$/i,
];

export type QueryComplexity = "simple" | "complex";

/**
 * Classify a user message as simple or complex.
 * Simple → Gemini Flash (no tools, <1s)
 * Complex → Claude Sonnet (with tools)
 */
export function classifyQuery(message: string): QueryComplexity {
  const lower = message.toLowerCase().trim();

  // Very short messages that are greetings/acknowledgments
  if (lower.length < 30) {
    for (const pattern of SIMPLE_PATTERNS) {
      if (pattern.test(lower)) return "simple";
    }
  }

  // Check for tool-requiring keywords
  for (const keyword of TOOL_KEYWORDS) {
    if (lower.includes(keyword)) return "complex";
  }

  // Questions about specific topics → complex
  if (lower.includes("?") && lower.length > 50) return "complex";

  // Commands (starting with /) → complex
  if (lower.startsWith("/")) return "complex";

  // Short conversational messages without tool keywords → simple
  if (lower.length < 100 && !lower.includes("?")) return "simple";

  // Default: complex (safer)
  return "complex";
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
