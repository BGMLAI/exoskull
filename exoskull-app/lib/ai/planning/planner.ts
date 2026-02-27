/**
 * Planner with Pre-Search — processes user messages in 3 stages:
 *
 * 1. PRE-SEARCH: Check memory + quick web scan for existing knowledge
 * 2. CLASSIFY: Domain + complexity detection
 * 3. PLAN: Intent detection, tool suggestions, BGML routing
 *
 * Pre-search runs BEFORE planning so the agent has context about
 * what it already knows vs. what it needs to find out.
 *
 * Uses Tier 1 (Gemini Flash) for web search (~100ms, ~$0.0001).
 */

import { classify, type ClassificationResult } from "@/lib/bgml/classifier";
import { unifiedSearch } from "@/lib/memory/unified-search";
import type { UnifiedSearchResult } from "@/lib/memory/types";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface PreSearchResult {
  /** Memory hits (from unified search) */
  memoryHits: Array<{ content: string; score: number; type: string }>;
  /** Web search snippets (from Tavily) */
  webSnippets: Array<{ title: string; content: string; url: string }>;
  /** Summary for context injection */
  contextSummary: string;
  /** Whether we found useful prior knowledge */
  hasRelevantMemory: boolean;
  /** Whether web search returned useful results */
  hasWebResults: boolean;
}

export interface ExecutionPlan {
  /** Original classification */
  classification: ClassificationResult;
  /** Pre-search results (memory + web) */
  preSearch: PreSearchResult;
  /** Detected user intent */
  intent: string;
  /** Suggested tools to use (ordered by priority) */
  suggestedTools: string[];
  /** Execution plan as context injection */
  contextInjection: string;
  /** Whether BGML pipeline should be activated */
  useBGML: boolean;
  /** Tool pack keywords for smart filtering */
  toolPackKeywords: string[];
}

// ============================================================================
// INTENT → TOOL MAPPING
// ============================================================================

const INTENT_TOOL_MAP: Record<string, { tools: string[]; keywords: string[] }> =
  {
    task_management: {
      tools: ["add_task", "list_tasks", "complete_task"],
      keywords: ["task", "zadanie", "todo"],
    },
    goal_tracking: {
      tools: ["define_goal", "check_goals", "log_goal_progress"],
      keywords: ["cel", "goal", "progress"],
    },
    email: {
      tools: ["search_emails", "email_summary", "send_email", "read_email"],
      keywords: ["email", "mail", "gmail", "skrzynka"],
    },
    calendar: {
      tools: [
        "list_calendar_events",
        "create_calendar_event",
        "check_availability",
      ],
      keywords: ["calendar", "kalendarz", "spotkanie", "meeting"],
    },
    communication: {
      tools: ["send_sms", "send_email", "make_call", "send_whatsapp"],
      keywords: ["send", "wyślij", "zadzwoń", "call", "sms"],
    },
    memory: {
      tools: ["search_memory", "get_daily_summary", "search_knowledge"],
      keywords: ["pamiętasz", "remember", "wczoraj", "kiedy"],
    },
    coding: {
      tools: [
        "code_read_file",
        "code_write_file",
        "code_bash",
        "code_grep",
        "execute_code",
      ],
      keywords: ["code", "kod", "deploy", "bug", "api"],
    },
    analytics: {
      tools: [
        "get_analytics_report",
        "get_ad_performance",
        "get_page_insights",
      ],
      keywords: ["analytics", "ads", "reklamy", "performance"],
    },
    social_media: {
      tools: [
        "publish_page_post",
        "publish_instagram_post",
        "publish_threads_post",
      ],
      keywords: ["facebook", "instagram", "threads", "post", "social"],
    },
    app_building: {
      tools: ["build_app", "list_apps", "app_log_data"],
      keywords: [
        "zbuduj",
        "build",
        "app",
        "aplikacja",
        "tracker",
        "zrób",
        "stwórz",
      ],
    },
    health: {
      tools: ["log_mod_data", "get_mod_data", "log_weight", "log_workout"],
      keywords: ["health", "zdrowie", "sen", "sleep", "waga", "ćwiczenia"],
    },
    strategy: {
      tools: [
        "start_debate",
        "search_web",
        "search_knowledge",
        "analyze_knowledge",
      ],
      keywords: ["strategia", "strategy", "analiza", "decyzja", "plan"],
    },
    search: {
      tools: ["search_web", "fetch_webpage", "discover_tools"],
      keywords: ["search", "szukaj", "znajdź", "google"],
    },
  };

// ============================================================================
// PRE-SEARCH
// ============================================================================

/** Keywords that suggest the query needs factual/external information */
const WEB_SEARCH_TRIGGERS = [
  "co to",
  "what is",
  "jak działa",
  "how does",
  "najnowsz",
  "latest",
  "current",
  "dzisiaj",
  "today",
  "2024",
  "2025",
  "2026",
  "cennik",
  "pricing",
  "porównaj",
  "compare",
  "vs",
  "versus",
  "statystyk",
  "statistics",
  "dane",
  "data about",
  "market",
  "rynek",
  "trend",
  "prognoz",
  "forecast",
  "news",
  "nowości",
  "aktualności",
];

/**
 * Run pre-search: check memory for existing knowledge + optional web scan.
 *
 * Runs in parallel:
 *   - Memory search (always, ~50ms)
 *   - Web search (only if query looks like it needs external info, ~200ms)
 */
async function runPreSearch(
  userMessage: string,
  tenantId: string,
  complexity: number,
): Promise<PreSearchResult> {
  const lower = userMessage.toLowerCase();
  const needsWebSearch =
    complexity >= 3 &&
    WEB_SEARCH_TRIGGERS.some((trigger) => lower.includes(trigger));

  const startMs = Date.now();

  // Run memory search + conditional web search in parallel
  const [memoryResults, webResults] = await Promise.all([
    // Memory search (always)
    unifiedSearch({
      tenantId,
      query: userMessage,
      limit: 5,
      minScore: 0.1,
    }).catch((err) => {
      logger.warn("[Planner:PreSearch] Memory search failed:", {
        error: err instanceof Error ? err.message : String(err),
      });
      return [] as UnifiedSearchResult[];
    }),

    // Web search (only if needed)
    needsWebSearch
      ? quickWebSearch(userMessage).catch((err) => {
          logger.warn("[Planner:PreSearch] Web search failed:", {
            error: err instanceof Error ? err.message : String(err),
          });
          return [] as Array<{ title: string; content: string; url: string }>;
        })
      : Promise.resolve(
          [] as Array<{ title: string; content: string; url: string }>,
        ),
  ]);

  const memoryHits = memoryResults.map((r) => ({
    content: r.content.slice(0, 300),
    score: r.score,
    type: r.type || "memory",
  }));

  const hasRelevantMemory = memoryHits.some((h) => h.score >= 0.3);
  const hasWebResults = webResults.length > 0;

  // Build context summary
  const parts: string[] = [];

  if (hasRelevantMemory) {
    parts.push("### Co już wiem (z pamięci)");
    for (const hit of memoryHits.slice(0, 3)) {
      parts.push(
        `- [${hit.type}, trafność: ${(hit.score * 100).toFixed(0)}%] ${hit.content}`,
      );
    }
  }

  if (hasWebResults) {
    parts.push("### Kontekst z sieci (pre-search)");
    for (const snippet of webResults.slice(0, 3)) {
      parts.push(`- **${snippet.title}**: ${snippet.content.slice(0, 200)}`);
    }
  }

  const contextSummary =
    parts.length > 0 ? `\n## PRE-SEARCH RESULTS\n${parts.join("\n")}` : "";

  logger.info("[Planner:PreSearch] Complete:", {
    durationMs: Date.now() - startMs,
    memoryHits: memoryHits.length,
    hasRelevantMemory,
    webSearchRan: needsWebSearch,
    webResults: webResults.length,
  });

  return {
    memoryHits,
    webSnippets: webResults,
    contextSummary,
    hasRelevantMemory,
    hasWebResults,
  };
}

/**
 * Quick web search via Tavily (lightweight, 3 results max).
 */
async function quickWebSearch(
  query: string,
): Promise<Array<{ title: string; content: string; url: string }>> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: 3,
        search_depth: "basic",
        include_answer: false,
      }),
      signal: AbortSignal.timeout(3000), // 3s hard timeout
    });

    if (!response.ok) return [];

    const data = await response.json();
    return (data.results || []).slice(0, 3).map((r: any) => ({
      title: r.title || "",
      content: r.content || "",
      url: r.url || "",
    }));
  } catch {
    return [];
  }
}

// ============================================================================
// INTENT DETECTION
// ============================================================================

function detectIntent(
  message: string,
  _classification: ClassificationResult,
): string[] {
  const lower = message.toLowerCase();
  const matches: Array<{ intent: string; score: number }> = [];

  for (const [intent, { keywords }] of Object.entries(INTENT_TOOL_MAP)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > 0) matches.push({ intent, score });
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.map((m) => m.intent);
}

// ============================================================================
// MAIN PLAN GENERATION
// ============================================================================

/**
 * Generate an execution plan with pre-search.
 *
 * Flow:
 *   1. Classify (deterministic, ~0ms)
 *   2. Pre-search: memory + web (parallel, ~50-200ms)
 *   3. Detect intent + suggest tools
 *   4. Build context injection with pre-search results
 */
export async function generatePlan(
  userMessage: string,
  tenantId: string,
): Promise<ExecutionPlan> {
  // Step 1: Classify
  const classification = classify(userMessage);

  // Step 2: Pre-search (memory + optional web scan)
  const preSearch = await runPreSearch(
    userMessage,
    tenantId,
    classification.complexity,
  );

  // Step 3: Detect intent
  const intents = detectIntent(userMessage, classification);
  const primaryIntent = intents[0] || "general";

  // Collect suggested tools from detected intents
  const suggestedTools: string[] = [];
  const toolPackKeywords: string[] = [];

  for (const intent of intents.slice(0, 3)) {
    const mapping = INTENT_TOOL_MAP[intent];
    if (mapping) {
      suggestedTools.push(...mapping.tools);
      toolPackKeywords.push(...mapping.keywords);
    }
  }

  // If pre-search found relevant memory, suggest memory tools
  if (preSearch.hasRelevantMemory) {
    suggestedTools.unshift("search_memory");
  }

  const uniqueTools = [...new Set(suggestedTools)];
  const uniqueKeywords = [...new Set(toolPackKeywords)];

  // Step 4: Build context injection
  const planParts: string[] = [];

  // Pre-search results first (so agent knows what it already has)
  if (preSearch.contextSummary) {
    planParts.push(preSearch.contextSummary);
  }

  // Execution plan
  if (classification.complexity >= 3 && uniqueTools.length > 0) {
    planParts.push(
      `\n## PLAN WYKONANIA\n` +
        `Intent: ${primaryIntent}\n` +
        `Domain: ${classification.domain} | Complexity: ${classification.complexity}/5\n` +
        `Prior knowledge: ${preSearch.hasRelevantMemory ? "TAK — weź pod uwagę" : "BRAK — może być potrzebny research"}\n` +
        `Suggested tools: ${uniqueTools.slice(0, 6).join(", ")}\n` +
        `Approach: ${getApproach(classification.complexity, classification.domain)}`,
    );
  }

  const contextInjection = planParts.join("\n");
  const useBGML = classification.complexity >= 3;

  logger.info("[Planner] Plan with pre-search:", {
    intent: primaryIntent,
    domain: classification.domain,
    complexity: classification.complexity,
    tools: uniqueTools.length,
    useBGML,
    hasMemory: preSearch.hasRelevantMemory,
    hasWeb: preSearch.hasWebResults,
  });

  return {
    classification,
    preSearch,
    intent: primaryIntent,
    suggestedTools: uniqueTools,
    contextInjection,
    useBGML,
    toolPackKeywords: uniqueKeywords,
  };
}

/**
 * Synchronous plan generation (no pre-search). For backward compatibility
 * and cases where we don't have tenantId.
 */
export function generatePlanSync(userMessage: string): Omit<
  ExecutionPlan,
  "preSearch"
> & {
  preSearch: null;
} {
  const classification = classify(userMessage);
  const intents = detectIntent(userMessage, classification);
  const primaryIntent = intents[0] || "general";

  const suggestedTools: string[] = [];
  const toolPackKeywords: string[] = [];

  for (const intent of intents.slice(0, 3)) {
    const mapping = INTENT_TOOL_MAP[intent];
    if (mapping) {
      suggestedTools.push(...mapping.tools);
      toolPackKeywords.push(...mapping.keywords);
    }
  }

  const uniqueTools = [...new Set(suggestedTools)];
  const uniqueKeywords = [...new Set(toolPackKeywords)];

  let contextInjection = "";
  if (classification.complexity >= 3 && uniqueTools.length > 0) {
    contextInjection =
      `\n## PLAN WYKONANIA\n` +
      `Intent: ${primaryIntent}\n` +
      `Domain: ${classification.domain} | Complexity: ${classification.complexity}/5\n` +
      `Suggested tools: ${uniqueTools.slice(0, 6).join(", ")}\n` +
      `Approach: ${getApproach(classification.complexity, classification.domain)}`;
  }

  return {
    classification,
    preSearch: null,
    intent: primaryIntent,
    suggestedTools: uniqueTools,
    contextInjection,
    useBGML: classification.complexity >= 3,
    toolPackKeywords: uniqueKeywords,
  };
}

function getApproach(complexity: number, domain: string): string {
  if (complexity >= 5)
    return "Strategic analysis — pre-search → BGML MoA (3 perspectives + synthesis)";
  if (complexity >= 4)
    return "Deep analysis — pre-search → BGML DIPPER (3 model perspectives)";
  if (complexity >= 3)
    return `Framework-guided — pre-search → specialist ${domain} framework`;
  return "Direct execution — single tool call";
}
