/**
 * Goal Onboarding — First-run goal discovery.
 *
 * During first conversation: structured goal-setting flow.
 * Parse goals from natural language → create via createGoal()
 * For each goal: run capability analysis → auto-build missing trackers.
 */

import { aiChat } from "@/lib/ai";
import { defineGoal } from "./engine";
import { analyzeGoalCapabilities } from "./capability-analyzer";
import { generateGoalStrategy } from "./strategy-engine";
import { logger } from "@/lib/logger";
import type { UserGoal, GoalCategory } from "./types";

// ============================================================================
// TYPES
// ============================================================================

interface ParsedGoal {
  name: string;
  category: GoalCategory;
  description?: string;
  target_value?: number;
  target_unit?: string;
  target_date?: string;
  direction?: "increase" | "decrease";
  frequency?: "daily" | "weekly" | "monthly";
}

export interface OnboardingResult {
  goalsCreated: number;
  capabilitiesBuilt: number;
  strategiesGenerated: number;
  goals: Array<{
    id: string;
    name: string;
    category: string;
    missingCapabilities: number;
  }>;
}

// ============================================================================
// ONBOARDING PROMPTS
// ============================================================================

/**
 * Get the initial goal discovery prompt for the user.
 */
export function getGoalDiscoveryPrompt(language: string = "pl"): string {
  if (language === "pl") {
    return (
      "Czesc! Jestem ExoSkull — Twoj osobisty system operacyjny. " +
      "Zeby Ci najlepiej pomagac, chce poznac Twoje cele.\n\n" +
      "Co chcesz osiagnac? Mozesz podac 1-3 celow w dowolnej formie, np.:\n" +
      '- "Chce schudnac 5kg do lata"\n' +
      '- "Czytac 30 minut dziennie"\n' +
      '- "Oszczedzic 5000 zl w 3 miesiace"\n\n' +
      "Napisz swoje cele:"
    );
  }

  return (
    "Hi! I'm ExoSkull — your personal operating system. " +
    "To help you best, I want to learn about your goals.\n\n" +
    "What do you want to achieve? You can share 1-3 goals in any form, e.g.:\n" +
    '- "Lose 5kg by summer"\n' +
    '- "Read 30 minutes daily"\n' +
    '- "Save $5000 in 3 months"\n\n' +
    "Share your goals:"
  );
}

// ============================================================================
// GOAL PARSING
// ============================================================================

/**
 * Parse goals from natural language user input.
 * Uses AI to extract structured goal data.
 */
export async function parseGoalsFromText(text: string): Promise<ParsedGoal[]> {
  try {
    const response = await aiChat(
      [
        {
          role: "system",
          content: `You extract structured goals from natural language. Output ONLY valid JSON array.

Categories: health, productivity, finance, mental, social, learning, creativity.
Directions: "increase" (more is better), "decrease" (less is better).

Example input: "Chcę schudnąć 5kg, czytać więcej i medytować codziennie"
Example output: [
  {"name":"Schudnąć 5kg","category":"health","target_value":5,"target_unit":"kg","direction":"decrease","frequency":"weekly"},
  {"name":"Czytać codziennie","category":"learning","target_value":30,"target_unit":"minut","direction":"increase","frequency":"daily"},
  {"name":"Codzienna medytacja","category":"mental","target_value":10,"target_unit":"minut","direction":"increase","frequency":"daily"}
]

Return ONLY a JSON array. Max 3 goals.`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      {
        taskCategory: "simple_response",
        maxTokens: 500,
      },
    );

    let content = response.content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return [parsed];
    return parsed.slice(0, 3);
  } catch (err) {
    logger.error("[GoalOnboarding] Parse failed:", {
      error: err instanceof Error ? err.message : err,
    });
    return [];
  }
}

// ============================================================================
// MAIN ONBOARDING FLOW
// ============================================================================

/**
 * Run the full onboarding flow: parse goals → create → analyze capabilities → build.
 */
export async function runGoalOnboarding(
  tenantId: string,
  userInput: string,
): Promise<OnboardingResult> {
  const result: OnboardingResult = {
    goalsCreated: 0,
    capabilitiesBuilt: 0,
    strategiesGenerated: 0,
    goals: [],
  };

  // Step 1: Parse goals from text
  const parsedGoals = await parseGoalsFromText(userInput);
  if (parsedGoals.length === 0) return result;

  // Step 2: Create each goal
  for (const parsed of parsedGoals) {
    try {
      const goal = await defineGoal(tenantId, {
        name: parsed.name,
        category: parsed.category,
        description: parsed.description,
        target_value: parsed.target_value,
        target_unit: parsed.target_unit,
        target_date: parsed.target_date,
        direction: parsed.direction,
        frequency: parsed.frequency,
      });

      result.goalsCreated++;

      // Step 3: Analyze capabilities
      const capReport = await analyzeGoalCapabilities(
        tenantId,
        goal as UserGoal,
      );

      result.goals.push({
        id: goal.id,
        name: goal.name,
        category: goal.category,
        missingCapabilities: capReport.missingCapabilities.length,
      });

      // Step 4: Auto-build missing tracker if needed
      if (
        capReport.missingCapabilities.some((mc) => mc.type === "tracking_app")
      ) {
        try {
          const { generateApp } =
            await import("@/lib/apps/generator/app-generator");
          const appResult = await generateApp({
            tenant_id: tenantId,
            description: `Tracker for goal: ${goal.name} (${goal.category}). Auto-generated during onboarding.`,
            source: "iors_suggestion",
          });
          if (appResult.success) result.capabilitiesBuilt++;
        } catch {
          // Non-critical — tracker can be built later
        }
      }

      // Step 5: Generate initial strategy
      try {
        await generateGoalStrategy(tenantId, goal.id);
        result.strategiesGenerated++;
      } catch {
        // Strategy generation is non-critical during onboarding
      }
    } catch (err) {
      logger.error("[GoalOnboarding] Goal creation failed:", {
        tenantId,
        goal: parsed.name,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  return result;
}
