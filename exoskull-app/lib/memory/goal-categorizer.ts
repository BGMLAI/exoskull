/**
 * Goal-Based Auto-Categorizer
 *
 * Takes ingested content and matches it to the user's active goals.
 * Uses lightweight AI (Gemini Flash) to classify relevance.
 *
 * Flow:
 *   1. Fetch user's active goals (cached per tenant, 5min TTL)
 *   2. AI classifies content against goals
 *   3. Store goal↔content link in `exo_goal_content_links`
 *
 * This enables "screenshot from bank → categorized as finance goal"
 * because categorization is based on GOALS, not hardcoded domains.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { getGoals } from "@/lib/goals/goal-service";
import type { Goal } from "@/lib/goals/goal-service";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface GoalMatch {
  goalId: string;
  goalName: string;
  relevance: "high" | "medium" | "low";
  reason: string;
}

export interface CategorizationResult {
  matches: GoalMatch[];
  category: string | null;
  error?: string;
}

// ============================================================================
// GOAL CACHE (5min TTL per tenant)
// ============================================================================

const goalCache = new Map<string, { goals: Goal[]; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60_000;

async function getActiveGoals(tenantId: string): Promise<Goal[]> {
  const cached = goalCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.goals;
  }

  const goals = await getGoals(tenantId, { is_active: true, limit: 20 });
  goalCache.set(tenantId, {
    goals,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return goals;
}

// ============================================================================
// FAST KEYWORD MATCHING (no AI cost for obvious matches)
// ============================================================================

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  health: [
    "zdrowie",
    "health",
    "ćwiczeni",
    "exercise",
    "gym",
    "siłownia",
    "dieta",
    "diet",
    "kalorie",
    "calories",
    "sen",
    "sleep",
    "waga",
    "weight",
    "lekarz",
    "doctor",
    "badania",
    "medycz",
    "medical",
    "fitness",
    "trening",
    "workout",
    "biegani",
    "running",
    "joga",
    "yoga",
  ],
  finance: [
    "finans",
    "finance",
    "pieniąd",
    "money",
    "bank",
    "konto",
    "account",
    "przelew",
    "transfer",
    "faktur",
    "invoice",
    "podatek",
    "tax",
    "oszczędności",
    "savings",
    "inwestycj",
    "invest",
    "budżet",
    "budget",
    "wydatek",
    "expense",
    "przychod",
    "income",
    "kredyt",
    "credit",
    "hipoteka",
    "mortgage",
    "ubezpiecze",
    "insurance",
    "pensja",
    "salary",
  ],
  productivity: [
    "produktywn",
    "productiv",
    "task",
    "projekt",
    "project",
    "deadline",
    "termin",
    "spotkani",
    "meeting",
    "praca",
    "work",
    "zawodow",
    "professional",
    "kariera",
    "career",
    "cel",
    "goal",
    "plan",
  ],
  learning: [
    "nauka",
    "learning",
    "kurs",
    "course",
    "książk",
    "book",
    "czytani",
    "reading",
    "szkoleni",
    "training",
    "certyfikat",
    "certificate",
    "umiejętnoś",
    "skill",
    "edukacj",
    "education",
    "studia",
    "studies",
  ],
  social: [
    "relacj",
    "relationship",
    "przyjaci",
    "friend",
    "rodzin",
    "family",
    "spotkani",
    "meetup",
    "wydarzeni",
    "event",
    "networking",
    "komunik",
    "communication",
    "rozmow",
    "conversation",
  ],
  mental: [
    "mental",
    "medytacj",
    "meditation",
    "stres",
    "stress",
    "emocj",
    "emotion",
    "samopoczu",
    "wellbeing",
    "terapia",
    "therapy",
    "mindful",
    "relaks",
    "relax",
    "psycholog",
  ],
  creativity: [
    "kreatywn",
    "creative",
    "sztuka",
    "art",
    "muzyka",
    "music",
    "pisani",
    "writing",
    "design",
    "projektowani",
    "fotografi",
    "photography",
    "video",
    "film",
    "rysunk",
    "drawing",
  ],
};

/**
 * Fast keyword-based category detection (no AI call).
 * Returns category if confident, null if ambiguous.
 */
function detectCategoryByKeywords(content: string): string | null {
  const lower = content.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > 0) scores[category] = score;
  }

  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;

  // Only return if top score is clearly dominant (2x next)
  if (entries.length === 1 || entries[0][1] >= entries[1][1] * 2) {
    return entries[0][0];
  }

  return null;
}

// ============================================================================
// AI-BASED CATEGORIZATION
// ============================================================================

/**
 * Categorize content against user's active goals using AI.
 *
 * Strategy:
 *   1. Try fast keyword match first (free)
 *   2. If goals exist + keyword match found → match goals in that category
 *   3. If ambiguous → use AI (Gemini Flash, ~$0.0001 per call)
 */
export async function categorizeContent(
  tenantId: string,
  content: string,
  sourceType: string,
  sourceId?: string,
): Promise<CategorizationResult> {
  try {
    const goals = await getActiveGoals(tenantId);

    if (goals.length === 0) {
      // No goals = no categorization
      const keywordCategory = detectCategoryByKeywords(content);
      return { matches: [], category: keywordCategory };
    }

    // ── Fast path: keyword match → find goals in that category ──
    const keywordCategory = detectCategoryByKeywords(content);
    if (keywordCategory) {
      const matchingGoals = goals.filter((g) => g.category === keywordCategory);
      if (matchingGoals.length > 0) {
        const matches: GoalMatch[] = matchingGoals.map((g) => ({
          goalId: g.id,
          goalName: g.name,
          relevance: "medium" as const,
          reason: `Keyword match: ${keywordCategory}`,
        }));

        // Store links asynchronously
        storeGoalLinks(tenantId, matches, sourceType, sourceId).catch((err) =>
          logger.warn("[GoalCategorizer] Store failed:", err),
        );

        return { matches, category: keywordCategory };
      }
      return { matches: [], category: keywordCategory };
    }

    // ── Slow path: AI classification ──
    // Only for content > 100 chars (don't waste AI on tiny snippets)
    if (content.length < 100) {
      return { matches: [], category: null };
    }

    const goalList = goals
      .map(
        (g) =>
          `- ID: ${g.id} | Name: "${g.name}" | Category: ${g.category}${g.description ? ` | Desc: ${g.description}` : ""}`,
      )
      .join("\n");

    const { aiChat } = await import("@/lib/ai");
    const response = await aiChat(
      [
        {
          role: "user",
          content: `Classify this content against the user's active goals.

## User's Goals:
${goalList}

## Content (${sourceType}):
${content.slice(0, 2000)}

Respond in JSON only:
{
  "matches": [
    { "goal_id": "uuid", "relevance": "high|medium|low", "reason": "brief reason" }
  ],
  "category": "health|finance|productivity|learning|social|mental|creativity|null"
}

Rules:
- Only include goals with genuine relevance
- "high" = directly about this goal
- "medium" = related to this goal's domain
- "low" = tangentially connected
- If no goals match, return empty matches array
- category = best-fit category even if no goals match`,
        },
      ],
      {
        forceModel: "gemini-2.5-flash",
        maxTokens: 512,
        tenantId,
        taskCategory: "analysis",
      },
    );

    // Parse AI response
    const parsed = parseAIResponse(response.content, goals);

    // Store links asynchronously
    if (parsed.matches.length > 0) {
      storeGoalLinks(tenantId, parsed.matches, sourceType, sourceId).catch(
        (err) => logger.warn("[GoalCategorizer] Store failed:", err),
      );
    }

    return parsed;
  } catch (err) {
    logger.error("[GoalCategorizer] Failed:", {
      error: err instanceof Error ? err.message : String(err),
      tenantId,
      sourceType,
    });
    return {
      matches: [],
      category: detectCategoryByKeywords(content),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function parseAIResponse(text: string, goals: Goal[]): CategorizationResult {
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { matches: [], category: null };

    const parsed = JSON.parse(jsonMatch[0]);
    const goalMap = new Map(goals.map((g) => [g.id, g]));

    const matches: GoalMatch[] = (parsed.matches || [])
      .filter(
        (m: { goal_id: string; relevance: string }) =>
          goalMap.has(m.goal_id) &&
          ["high", "medium", "low"].includes(m.relevance),
      )
      .map((m: { goal_id: string; relevance: string; reason?: string }) => ({
        goalId: m.goal_id,
        goalName: goalMap.get(m.goal_id)!.name,
        relevance: m.relevance as "high" | "medium" | "low",
        reason: m.reason || "",
      }));

    const validCategories = [
      "health",
      "finance",
      "productivity",
      "learning",
      "social",
      "mental",
      "creativity",
    ];
    const category = validCategories.includes(parsed.category)
      ? parsed.category
      : null;

    return { matches, category };
  } catch {
    return { matches: [], category: null };
  }
}

/**
 * Store goal↔content links in the database.
 */
async function storeGoalLinks(
  tenantId: string,
  matches: GoalMatch[],
  sourceType: string,
  sourceId?: string,
): Promise<void> {
  if (matches.length === 0) return;

  const supabase = getServiceSupabase();

  const rows = matches.map((m) => ({
    tenant_id: tenantId,
    goal_id: m.goalId,
    source_type: sourceType,
    source_id: sourceId || null,
    relevance: m.relevance,
    reason: m.reason,
    created_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("exo_goal_content_links").upsert(rows, {
    onConflict: "tenant_id,goal_id,source_type,source_id",
    ignoreDuplicates: true,
  });

  if (error) {
    // Table might not exist yet — log but don't throw
    logger.warn("[GoalCategorizer] Link storage failed:", error.message);
  }
}
