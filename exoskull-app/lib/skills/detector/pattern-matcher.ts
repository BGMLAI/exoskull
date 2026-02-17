/**
 * Pattern Matcher - Detects frequent conversation topics that lack a matching tracker
 *
 * Analyzes recent conversations (7 days) for recurring themes.
 * Uses Gemini Flash (Tier 1) for topic extraction - cheap and fast.
 * Compares extracted topics with installed mods to find gaps.
 */

import { createServiceClient } from "@/lib/supabase/service-client";
import { aiChat } from "@/lib/ai";
import type {
  TopicFrequency,
  PatternSkillGap,
  DetectionContext,
  SkillSuggestion,
} from "./types";

import { logger } from "@/lib/logger";
// =====================================================
// TOPIC → MOD MAPPING
// =====================================================

// Maps conversation topics to the mod slug that would cover them
const TOPIC_TO_MOD: Record<string, string[]> = {
  // Health topics
  water: ["custom-water-tracker", "habit-tracker"],
  hydration: ["custom-water-tracker", "habit-tracker"],
  sleep: ["sleep-tracker"],
  exercise: ["custom-exercise-tracker", "energy-monitor"],
  workout: ["custom-exercise-tracker", "energy-monitor"],
  gym: ["custom-exercise-tracker"],
  running: ["custom-running-tracker"],
  walking: ["custom-step-tracker"],
  steps: ["custom-step-tracker"],
  calories: ["custom-calorie-tracker"],
  food: ["custom-food-tracker", "habit-tracker"],
  diet: ["custom-food-tracker"],
  nutrition: ["custom-food-tracker"],
  weight: ["custom-weight-tracker"],
  medication: ["custom-medication-tracker"],
  supplements: ["custom-supplement-tracker"],
  caffeine: ["custom-caffeine-tracker"],
  coffee: ["custom-caffeine-tracker"],
  alcohol: ["custom-alcohol-tracker"],

  // Productivity
  focus: ["focus-mode", "custom-focus-tracker"],
  reading: ["custom-reading-tracker"],
  books: ["custom-reading-tracker"],
  writing: ["custom-writing-tracker"],
  learning: ["custom-learning-tracker"],
  courses: ["custom-learning-tracker"],
  study: ["custom-study-tracker"],
  pomodoro: ["custom-pomodoro-tracker", "focus-mode"],

  // Finance
  spending: ["spending-tracker", "custom-expense-tracker"],
  expenses: ["spending-tracker", "custom-expense-tracker"],
  savings: ["custom-savings-tracker"],
  budget: ["spending-tracker", "custom-budget-tracker"],
  investments: ["custom-investment-tracker"],

  // Mental
  mood: ["mood-tracker"],
  stress: ["mood-tracker", "custom-stress-tracker"],
  anxiety: ["mood-tracker", "custom-stress-tracker"],
  meditation: ["custom-meditation-tracker"],
  gratitude: ["custom-gratitude-tracker"],
  journal: ["custom-journal-tracker"],

  // Social
  social: ["custom-social-tracker"],
  friends: ["custom-social-tracker"],
  networking: ["custom-networking-tracker"],
};

// Minimum mention count to consider a topic "frequent"
const MIN_FREQUENCY = 3;
const ANALYSIS_DAYS = 7;

// =====================================================
// PATTERN MATCHING
// =====================================================

/**
 * Analyze recent conversations for topic patterns that suggest missing skills
 */
export async function matchPatterns(
  context: DetectionContext,
): Promise<PatternSkillGap[]> {
  try {
    const supabase = createServiceClient();

    // 1. Load recent conversations (last 7 days)
    const since = new Date();
    since.setDate(since.getDate() - ANALYSIS_DAYS);

    const { data: messages } = await supabase
      .from("exo_unified_messages")
      .select("content, source, created_at")
      .eq("tenant_id", context.tenant_id)
      .gte("created_at", since.toISOString())
      .not("content", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);

    if (!messages || messages.length < 5) return [];

    // 2. Extract topics using AI (Tier 1 - Gemini Flash)
    const transcript = messages
      .filter((m) => m.source === "user" || m.source === "web_chat")
      .map((m) => m.content)
      .join("\n");

    if (transcript.length < 50) return [];

    const topics = await extractTopicsWithAI(transcript);

    // 3. Find topics without matching installed mods
    const gaps = findSkillGaps(topics, context);

    return gaps;
  } catch (error) {
    logger.error("[PatternMatcher] Error:", {
      error: error instanceof Error ? error.message : error,
      tenant_id: context.tenant_id,
    });
    return [];
  }
}

/**
 * Convert pattern gaps to skill suggestions
 */
export function patternsToSuggestions(
  gaps: PatternSkillGap[],
  context: DetectionContext,
): SkillSuggestion[] {
  return gaps.map((gap) => ({
    tenant_id: context.tenant_id,
    source: "pattern_match" as const,
    description: `Track ${gap.topic} (mentioned ${gap.frequency.count}x in ${gap.frequency.days_span} days)`,
    suggested_slug: `custom-${gap.topic.toLowerCase().replace(/\s+/g, "-")}-tracker`,
    life_area: gap.frequency.related_area,
    confidence: gap.confidence,
    reasoning: gap.reasoning,
    conversation_id: context.conversation_id,
    status: "pending" as const,
  }));
}

// =====================================================
// AI TOPIC EXTRACTION
// =====================================================

async function extractTopicsWithAI(
  transcript: string,
): Promise<TopicFrequency[]> {
  try {
    const response = await aiChat(
      [
        {
          role: "system",
          content: `You are a topic frequency analyzer. Given a user's conversation transcript, extract recurring topics/themes that they mention frequently. Focus on trackable activities, habits, or interests.

Output ONLY a JSON array of objects with:
- topic: string (1-2 words, lowercase)
- count: number (approximate mentions)
- related_area: string (one of: health, productivity, finance, mental, social, learning, creativity)
- sample_mentions: string[] (2-3 short quotes)

Example output:
[{"topic":"coffee","count":8,"related_area":"health","sample_mentions":["piłem dziś 3 kawy","znowu za dużo kawy"]}]

Return ONLY valid JSON array, no markdown, no explanation.`,
        },
        {
          role: "user",
          content: `Analyze this transcript for recurring topics:\n\n${transcript.slice(0, 3000)}`,
        },
      ],
      {
        taskCategory: "simple_response", // Tier 1 - Gemini Flash
        maxTokens: 1024,
      },
    );

    const parsed = JSON.parse(response.content);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (t: TopicFrequency) =>
          t.topic && typeof t.count === "number" && t.count >= MIN_FREQUENCY,
      )
      .map((t: TopicFrequency) => ({
        topic: t.topic,
        count: t.count,
        days_span: ANALYSIS_DAYS,
        related_area: t.related_area,
        sample_mentions: t.sample_mentions || [],
      }));
  } catch (error) {
    logger.error("[PatternMatcher] AI extraction failed:", {
      error: error instanceof Error ? error.message : error,
    });
    return [];
  }
}

// =====================================================
// GAP DETECTION
// =====================================================

function findSkillGaps(
  topics: TopicFrequency[],
  context: DetectionContext,
): PatternSkillGap[] {
  const gaps: PatternSkillGap[] = [];
  const allSlugs = [...context.installed_mods, ...context.existing_skills];

  for (const topic of topics) {
    const topicLower = topic.topic.toLowerCase();

    // Check if any installed mod covers this topic
    const coveringMods = TOPIC_TO_MOD[topicLower] || [];
    const isCovered = coveringMods.some((mod) => allSlugs.includes(mod));

    if (isCovered) continue;

    // Check if we already suggested this recently
    const alreadySuggested = context.recent_suggestions.some((s) =>
      s.toLowerCase().includes(topicLower),
    );
    if (alreadySuggested) continue;

    // Calculate confidence based on frequency
    const confidence = calculatePatternConfidence(topic);

    if (confidence < 0.4) continue;

    gaps.push({
      topic: topic.topic,
      frequency: topic,
      missing_mod: coveringMods[0] || `custom-${topicLower}-tracker`,
      confidence,
      reasoning: buildPatternReasoning(topic),
    });
  }

  // Sort by confidence (highest first)
  return gaps.sort((a, b) => b.confidence - a.confidence);
}

function calculatePatternConfidence(topic: TopicFrequency): number {
  let confidence = 0.4; // Base

  // More mentions = higher confidence
  if (topic.count >= 5) confidence += 0.1;
  if (topic.count >= 10) confidence += 0.1;
  if (topic.count >= 15) confidence += 0.1;

  // Known trackable area = higher confidence
  if (topic.related_area) confidence += 0.05;

  // Known topic mapping exists = higher confidence
  if (TOPIC_TO_MOD[topic.topic.toLowerCase()]) confidence += 0.05;

  return Math.min(confidence, 0.8);
}

function buildPatternReasoning(topic: TopicFrequency): string {
  const samples =
    topic.sample_mentions.length > 0
      ? ` Examples: "${topic.sample_mentions.slice(0, 2).join('", "')}"`
      : "";
  return `User mentioned "${topic.topic}" ${topic.count} times in ${topic.days_span} days but has no tracker for it.${samples}`;
}
