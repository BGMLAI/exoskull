/**
 * Async Task Classifier
 *
 * Determines whether an inbound message should be processed
 * synchronously (inline) or queued for background processing.
 *
 * Uses fast regex heuristics — no API call, <1ms execution.
 * Default: sync (most messages are simple).
 */

export interface ClassificationResult {
  mode: "sync" | "async";
  reason: string;
}

// Messages shorter than this are always sync
const SHORT_MESSAGE_THRESHOLD = 30;

// Patterns that strongly indicate background processing needed
const ASYNC_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Research / analysis requests
  {
    pattern: /zbadaj|przeanalizuj|przeanalizować|research|investigate|analyze/i,
    reason: "research-type request",
  },
  // Comparison / evaluation
  {
    pattern: /porownaj.*opcj|compare.*option|zestawienie|ewaluacja/i,
    reason: "comparison analysis",
  },
  // Long-range planning
  {
    pattern:
      /zaplanuj.*(tydzien|tydzie|miesiac|miesią|rok)|plan.*(week|month|year)/i,
    reason: "long-range planning",
  },
  // Content generation
  {
    pattern:
      /napisz.*(raport|dokument|artykul|artyku|email|mail)|write.*(report|document|article)/i,
    reason: "content generation",
  },
  // Deep summarization
  {
    pattern:
      /podsumuj.*(wszystko|calosc|całość|ostatni)|summarize.*(everything|all|last)/i,
    reason: "deep summarization",
  },
  // Explicit async language
  {
    pattern: /zajmij sie|zajmij się|zrob.*w tle|zrób.*w tle|nie spiesz sie/i,
    reason: "explicit async request",
  },
  // Broad search / finding
  {
    pattern: /znajdz.*(najlepsz|najtansz|wszystk)|find.*(best|cheapest|all)/i,
    reason: "broad search",
  },
  // Complex creation
  {
    pattern:
      /stworz.*(plan|strategi|budzet|budżet)|create.*(plan|strategy|budget)/i,
    reason: "complex creation",
  },
  // Multi-step delegation
  {
    pattern: /krok po kroku|step by step|szczegolowo|szczegółowo|in detail/i,
    reason: "detailed multi-step request",
  },
];

// Patterns that confirm sync processing (override length-based heuristic)
const SYNC_PATTERNS: RegExp[] = [
  // Simple CRUD / greetings
  /^(dodaj|usun|usuń|pokaz|pokaż|co mam|status|lista|log|hej|cześć|czesc|siema|hello|hi|yo|ok|tak|nie|dziekuje|dziękuję|super|fajnie|dobra)\b/i,
  // Mood/energy check-ins: "energia 7", "humor 8"
  /^(energia|humor|nastroj|nastrój|sen|spanie)\s*\d/i,
  // Single word commands
  /^\S+$/,
];

/**
 * Classify a message as sync or async based on text heuristics.
 * Zero latency cost — pure regex matching.
 */
export function classifyMessage(text: string): ClassificationResult {
  const trimmed = text.trim();

  // Short messages are always sync
  if (trimmed.length < SHORT_MESSAGE_THRESHOLD) {
    return { mode: "sync", reason: "short message" };
  }

  // Check sync patterns first (more common)
  for (const pattern of SYNC_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { mode: "sync", reason: "sync pattern match" };
    }
  }

  // Check async patterns
  for (const { pattern, reason } of ASYNC_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { mode: "async", reason };
    }
  }

  // Default: sync (most messages are simple)
  return { mode: "sync", reason: "default" };
}
